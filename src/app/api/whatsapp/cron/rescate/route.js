import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

// ── 💤 CRON: RESCATE DE CLIENTES INACTIVOS ──
// Revisa todos los clientes de Loyverse y les manda cupón automático
// si llevan X días sin visitar. El cupón se RE-ENVÍA cada ciclo de X días
// (ej. inactivityDays=10 → se manda al día 10, 20, 30, 40...).
//
// 🛡️ MOTOR ANTI-SPAM:
// - Delays aleatorios entre envíos (2-8 segundos)
// - Orden de envío aleatorio (shuffle)
// - Presencia "composing" antes de mandar
// - Variación en hora de ejecución (cron a las 11am pero ejecuta con offset)

// ── 🎲 Utilidades Anti-Detección ──
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomDelay(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

async function sendWithPresence(phoneId, text, cfg, promo) {
  const instance = cfg.wappInstance;
  const token = cfg.wappToken;
  const baseUrl = `https://gatewaywapp-production.up.railway.app/${instance}`;

  // 1. Simular "composing" (typing) antes de enviar
  try {
    await fetch(`${baseUrl}/messages/presence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, to: phoneId, state: 'composing' })
    }).catch(() => {});
  } catch(e) {}

  // 2. Espera aleatoria simulando que "escribe" (1.5 - 4 segundos)
  await randomDelay(1500, 4000);

  // 3. Enviar mensaje (texto o imagen)
  let endpoint = '/messages/chat';
  let wBody = { token, to: phoneId, body: text };

  if (promo.image && promo.image.trim()) {
    endpoint = '/messages/image';
    wBody = {
      token,
      to: phoneId,
      image: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${promo.id}&ts=${Date.now()}`,
      caption: text
    };
  }

  const res = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(wBody)
  });

  return res.ok;
}

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

    // 4. Build eligible list first, then shuffle for anti-detection
    const eligible = [];

    for (const customer of allCustomers) {
      if (!customer.phone_number || !customer.total_visits || customer.total_visits < 1) continue;

      const cleanPhone = '52' + customer.phone_number.replace(/\D/g, '').slice(-10);

      // Skip if reset lock active
      const resetLock = await redis.get(`reset_lock_${cleanPhone}`);
      if (resetLock) continue;

      // Calculate days since last activity
      const lastDate = customer.updated_at;
      if (!lastDate) continue;

      const lastVisitStr = new Date(lastDate).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
      const lastVisitMs = new Date(lastVisitStr).getTime();
      const daysSinceVisit = Math.round((todayMs - lastVisitMs) / 86400000);

      if (daysSinceVisit < 1) continue;

      // Check each inactivity promo
      for (const promo of inactivityPromos) {
        const triggers = promo.inactivityDays.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

        for (const triggerDays of triggers) {
          if (daysSinceVisit >= triggerDays) {
            // ── LÓGICA DE RE-ENVÍO CÍCLICO ──
            // El lock expira después de triggerDays días, permitiendo re-envío cada ciclo.
            // Ej: trigger=10: día 10 → envía + lock 10d → día 20 lock expiró → envía + lock 10d → ...
            const lockKey = `promo_inact_${cleanPhone}_${promo.id}_${triggerDays}`;
            const alreadySent = await redis.get(lockKey);
            if (alreadySent) continue;

            eligible.push({
              customer,
              cleanPhone,
              promo,
              triggerDays,
              daysSinceVisit,
              lockKey
            });
            break; // Solo 1 trigger por promo por cliente
          }
        }
      }
    }

    // 5. 🎲 SHUFFLE — Orden aleatorio para que WhatsApp no detecte patrón
    const shuffled = shuffleArray(eligible);

    let sentCount = 0;

    for (const entry of shuffled) {
      const { customer, cleanPhone, promo, triggerDays, lockKey } = entry;

      // Mutex to avoid double-send
      const mutexKey = `inactivity_sending_${cleanPhone}`;
      const acquired = await redis.setnx(mutexKey, '1');
      if (!acquired) continue;
      await redis.expire(mutexKey, 60);

      try {
        // Generate coupon
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

        // 🛡️ ANTI-SPAM: delay aleatorio entre envíos (2-8 seg)
        if (sentCount > 0) {
          await randomDelay(2000, 8000);
        }

        // Enviar con presencia simulada
        const ok = await sendWithPresence(cleanPhone + '@c.us', promoText, cfg, promo);

        if (ok) {
          // Lock con TTL = triggerDays (en segundos). Cuando expire, el siguiente ciclo puede mandar de nuevo.
          const ttlSeconds = triggerDays * 24 * 60 * 60;
          await redis.set(lockKey, '1');
          await redis.expire(lockKey, ttlSeconds);
          await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
          sentCount++;
          console.log(`[Rescue] 💤 Cupón ${folio} → ${customer.name} (${cleanPhone}) — ${entry.daysSinceVisit}d inactivo — lock ${triggerDays}d`);
        }
      } catch (e) {
        console.error(`[Rescue] Error enviando a ${cleanPhone}:`, e.message);
      } finally {
        await redis.del(mutexKey);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Rescue complete',
      sent: sentCount,
      eligible: eligible.length,
      checked: allCustomers.length
    });
  } catch (error) {
    console.error('[Rescue] Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
