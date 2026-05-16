import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const keysRaw = await redis.keys('chat_hist_*@c.us');
    let fetchKeys = Array.from(new Set(keysRaw || []));
    let phones = fetchKeys.map(k => k.replace('chat_hist_', '').replace('@c.us', ''));

    // ── 📌 Inyectar TODOS los Grupos Pinned ──
    const pinnedRaw = await redis.get('pinned_groups');
    const pinnedGroups = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    // Legacy: also check ventas_grupo_id
    const legacyGrupoId = await redis.get('ventas_grupo_id');
    
    // Build unified set of pinned group IDs
    const allPinnedMap = {};
    for (const pg of pinnedGroups) {
      allPinnedMap[pg.id] = pg.name || 'Grupo';
    }
    if (legacyGrupoId && legacyGrupoId.includes('@g.us') && !allPinnedMap[legacyGrupoId]) {
      allPinnedMap[legacyGrupoId] = 'Grupo Ventas';
    }

    // Inject each pinned group into the phones/fetchKeys arrays
    for (const [gId, gName] of Object.entries(allPinnedMap)) {
      const gCleanPhone = '52' + gId.replace(/\D/g, '').slice(-10);
      const gPhoneIndex = phones.indexOf(gCleanPhone);
      if (gPhoneIndex !== -1) {
        // Replace the "phone" with the JID so frontend can respond
        phones[gPhoneIndex] = gId;
      } else {
        phones.push(gId);
        fetchKeys.push(`chat_hist_${gCleanPhone}@c.us`);
      }
    }

    if (!fetchKeys || fetchKeys.length === 0) return NextResponse.json({ success: true, chats: [] });

    // Batch: build all metadata keys and fetch in one mget
    const metaKeys = phones.flatMap(p => {
      let redisPhone = p;
      if (p.includes('@g.us')) redisPhone = '52' + p.replace(/\D/g, '').slice(-10);
      return [
        `client_name_${redisPhone}`,
        `chat_unread_${redisPhone}`,
        `client_store_${redisPhone}`,
        `human_read_${redisPhone}`,
        `delivery_mode_${redisPhone}`,
        `delivery_bot_silence_${redisPhone}`
      ];
    });

    const [histResults, metaResults] = await Promise.all([
      Promise.all(fetchKeys.map(k => redis.get(k))),
      metaKeys.length > 0 ? redis.mget(...metaKeys) : []
    ]);

    const chats = phones.map((phone, i) => {
      try {
        const histData = histResults[i];
        const base = i * 6;
        const cachedName = metaResults[base] || null;
        const unreadRaw = metaResults[base + 1] || '0';
        const cachedStore = metaResults[base + 2] || '';
        const humanRead = metaResults[base + 3] || null;
        const deliveryMode = metaResults[base + 4] || null;
        const botSilence = metaResults[base + 5] || null;

        const parsed = typeof histData === 'string' ? JSON.parse(histData) : (histData || []);
        const lastMsg = parsed.length > 0 ? parsed[parsed.length - 1] : null;

        let name = cachedName || phone.slice(-10);
        let isGroup = false;
        if (allPinnedMap[phone]) {
          name = `📌 ${allPinnedMap[phone]}`;
          isGroup = true;
        }

        return {
          phone,
          name,
          lastText: (lastMsg?.parts?.[0]?.text || '').substring(0, 80),
          lastTs: lastMsg?.parts?.[0]?.ts || 0,
          fromMe: lastMsg?.role === 'model',
          unread: parseInt(unreadRaw || '0'),
          msgCount: parsed.length,
          store: cachedStore || '',
          needsHuman: !humanRead && parsed.length > 0,
          deliveryMode: !!deliveryMode,
          botSilent: !!botSilence,
          isGroup
        };
      } catch {
        return { phone, name: allPinnedMap[phone] ? `📌 ${allPinnedMap[phone]}` : phone.slice(-10), lastText: '', lastTs: 0, fromMe: false, unread: 0, msgCount: 0, store: '', needsHuman: false, deliveryMode: false, botSilent: false, isGroup: !!allPinnedMap[phone] };
      }
    });

    chats.sort((a, b) => {
      if (a.isGroup && !b.isGroup) return -1;
      if (!a.isGroup && b.isGroup) return 1;
      return (b.lastTs || 0) - (a.lastTs || 0);
    });
    return NextResponse.json({ success: true, chats });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message, chats: [] });
  }
}

// Borra al cliente a profundidad: primero Loyverse, luego todo nuestro sistema
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawPhone = (searchParams.get('phone') || '').replace(/\D/g, '');
    if (!rawPhone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = rawPhone;
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
    const phone10 = cleanPhone.slice(-10);

    // ── 1. PRIMERO: borrar de Loyverse ──
    const loyverseToken = await redis.get('loyverse_token');
    let deletedFromLoyverse = false;
    if (loyverseToken) {
      try {
        let cursor = null;
        let keepSearching = true;
        while (keepSearching) {
          let url = `https://api.loyverse.com/v1.0/customers?limit=250`;
          if (cursor) url += `&cursor=${cursor}`;
          const searchRes = await fetch(url, { headers: { Authorization: `Bearer ${loyverseToken}` } });
          if (!searchRes.ok) break;
          const searchData = await searchRes.json();
          const matches = (searchData.customers || []).filter(c => {
            if (!c.phone_number) return false;
            return c.phone_number.replace(/\D/g, '').endsWith(phone10);
          });
          for (const match of matches) {
            const delRes = await fetch(`https://api.loyverse.com/v1.0/customers/${match.id}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${loyverseToken}` }
            });
            if (delRes.ok) deletedFromLoyverse = true;
          }
          cursor = searchData.cursor || null;
          keepSearching = !!cursor;
        }
      } catch (e) { console.error('[chat DELETE] Loyverse error:', e); }
    }

    // ── 2. DESPUÉS: borrar de nuestro sistema (Redis) ──
    const folio = await redis.get(`promo_folio_${cleanPhone}`);
    let keysToDelete = [];
    try {
      const dynKeys = await redis.keys(`*${phone10}*`);
      if (dynKeys?.length) keysToDelete = keysToDelete.concat(dynKeys);
      if (folio) {
        const folioKeys = await redis.keys(`*${folio}*`);
        if (folioKeys?.length) keysToDelete = keysToDelete.concat(folioKeys);
      }
    } catch {}

    const manualKeys = [
      `chat_hist_${rawPhone}@c.us`, `chat_hist_${rawPhone}`,
      `chat_hist_${cleanPhone}@c.us`, `chat_hist_${cleanPhone}`,
      `chat_unread_${cleanPhone}`, `typing_${cleanPhone}`,
      `client_name_${cleanPhone}`, `client_points_${cleanPhone}`,
      `client_store_${cleanPhone}`, `client_registered_${cleanPhone}`,
      `promo_pos_${cleanPhone}`, `promo_folio_${cleanPhone}`,
      `user_state_${cleanPhone}`, `coupon_sending_${cleanPhone}`,
      `loyverse_visits_${cleanPhone}`, `pending_folio_store_${cleanPhone}`,
      `profile_pic_${cleanPhone}`
    ];
    if (folio) {
      manualKeys.push(
        `folio_owner_${folio}`, `folio_valid_date_${folio}`,
        `folio_item_name_${folio}`, `folio_item_id_${folio}`,
        `folio_status_${folio}`, `folio_promo_id_${folio}`
      );
    }
    for (let v = 1; v <= 50; v++) manualKeys.push(`promo_sent_${cleanPhone}_v_${v}`);
    for (const s of [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]) manualKeys.push(`promo_sent_${cleanPhone}_s_${s}`);

    keysToDelete = [...new Set([...keysToDelete, ...manualKeys])];
    for (const key of keysToDelete) {
      if (key.includes('reset_lock_')) continue;
      await redis.del(key);
    }
    await redis.setex(`reset_lock_${cleanPhone}`, 15, '1');

    return NextResponse.json({ success: true, deletedFromLoyverse });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
