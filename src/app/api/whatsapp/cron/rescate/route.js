import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

// ── 💤 CRON: RESCATE DE CLIENTES INACTIVOS ──
// Revisa todos los clientes de Loyverse y les manda cupón automático
// si llevan X días sin visitar (configurado en la promo con inactivityDays).
// Se ejecuta 1 vez al día a las 11am hora Monterrey.

export async function GET(req) {
  try {
    // Auth check
    const authH = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authH !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ error: 'No loyverse token' }, { status: 500 });

    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!cfg.wappInstance || !cfg.wappToken) {
      return NextResponse.json({ error: 'No wapp config' }, { status: 500 });
    }

    // 1. Get promos with inactivityDays
    const promosRaw = await redis.get('promotions');
    const promos = promosRaw ? (typeof promosRaw === 'string' ? JSON.parse(promosRaw) : promosRaw) : [];
    const inactivityPromos = promos.filter(p => p.inactivityDays && !p.isWelcomePromo);

    if (inactivityPromos.length === 0) {
      return NextResponse.json({ success: true, message: 'No inactivity promos configured', sent: 0 });
    }

    // 2. Fetch ALL customers from Loyverse (paginated)
    let allCustomers = [];
    let cursor = null;
    let keepFetching = true;
    while (keepFetching) {
      let url = 'https://api.loyverse.com/v1.0/customers?limit=250';
      if (cursor) url += `&cursor=${cursor}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${loyverseToken}` } });
      if (!res.ok) break;
      const data = await res.json();
      if (data.customers?.length) allCustomers = allCustomers.concat(data.customers);
      cursor = data.cursor || null;
      keepFetching = !!cursor;
    }

    // 3. Calculate today in Monterrey timezone
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
    const todayMs = new Date(todayStr).getTime();

    let sentCount = 0;
    const MAX_SENDS = 20; // Limit per cron run to avoid WhatsApp throttling

    for (const customer of allCustomers) {
      if (sentCount >= MAX_SENDS) break;

      // Must have phone and at least 1 visit
      if (!customer.phone_number || !customer.total_visits || customer.total_visits < 1) continue;

      const cleanPhone = '52' + customer.phone_number.replace(/\D/g, '').slice(-10);

      // Skip if there's a reset lock
      const resetLock = await redis.get(`reset_lock_${cleanPhone}`);
      if (resetLock) continue;

      // Calculate days since last activity
      const lastDate = customer.updated_at;
      if (!lastDate) continue;

      const lastVisitStr = new Date(lastDate).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      const lastVisitMs = new Date(lastVisitStr).getTime();
      const daysSinceVisit = Math.round((todayMs - lastVisitMs) / 86400000);

      if (daysSinceVisit < 1) continue; // Visited today, skip

      // 4. Check each inactivity promo
      for (const promo of inactivityPromos) {
        const triggers = promo.inactivityDays.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

        for (const triggerDays of triggers) {
          if (daysSinceVisit >= triggerDays) {
            // Check if already sent for this threshold
            const lockKey = `promo_sent_${cleanPhone}_inactive_${triggerDays}`;
            const alreadySent = await redis.get(lockKey);
            if (alreadySent) continue;

            // Mutex to avoid double-send
            const mutexKey = `inactivity_sending_${cleanPhone}`;
            const acquired = await redis.setnx(mutexKey, '1');
            if (!acquired) continue;
            await redis.expire(mutexKey, 30);

            try {
              // Generate and send coupon
              const folio = generateFolio();
              const { text: promoTextRaw, validDate } = buildPromoText(promo.text, folio, promo.validFrom, promo.validityDuration);
              const promoText = promoTextRaw.replace(/{nombre_de_cliente}/g, customer.name || '');

              await redis.set(`promo_folio_${cleanPhone}`, folio);
              await redis.set(`folio_item_name_${folio}`, promo.itemName || 'Burger Gratis');
              await redis.set(`folio_owner_${folio}`, cleanPhone);
              await redis.set(`folio_valid_date_${folio}`, validDate);
              if (promo.id) {
                await redis.set(`folio_promo_id_${folio}`, promo.id);
                await redis.incr(`promo_sent_count_${promo.id}`);
              }

              let endpoint = '/messages/chat';
              let wBody = { token: cfg.wappToken, to: cleanPhone + '@c.us', body: promoText };

              if (promo.image && promo.image.trim()) {
                endpoint = '/messages/image';
                wBody = {
                  token: cfg.wappToken,
                  to: cleanPhone + '@c.us',
                  image: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${promo.id}&ts=${Date.now()}`,
                  caption: promoText
                };
              }

              const gwRes = await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wBody)
              });

              if (gwRes.ok) {
                await redis.set(lockKey, '1'); // Mark as sent for this threshold
                await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
                sentCount++;
                console.log(`[Rescue] 💤 Cupón enviado a ${customer.name} (${cleanPhone}) — ${daysSinceVisit} días inactivo`);
              }
            } catch (e) {
              console.error(`[Rescue] Error enviando a ${cleanPhone}:`, e.message);
            } finally {
              await redis.del(mutexKey);
            }

            break; // Only 1 inactivity promo per customer per run
          }
        }
      }
    }

    return NextResponse.json({ success: true, message: `Rescue complete`, sent: sentCount, checked: allCustomers.length });
  } catch (error) {
    console.error('[Rescue] Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
