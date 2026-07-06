import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { normalizeChatPhone, saveChatMeta } from '@/lib/chatMeta';

const CHAT_PAGE_SIZE = 10;
const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function purgeExpiredChats(chats) {
  const cutoff = Date.now() - CHAT_RETENTION_MS;
  const expired = chats.filter(c =>
    !c.isGroup &&
    c._redisPhone &&
    c.lastTs > 0 &&
    c.lastTs < cutoff &&
    (c.msgCount || 0) > 0
  );

  if (!expired.length) return 0;

  await Promise.all(expired.map(async ({ _redisPhone }) => {
    const phone10 = _redisPhone.slice(-10);
    const keys = [
      `chat_hist_${_redisPhone}@c.us`,
      `chat_hist_${_redisPhone}`,
      `chat_meta_${_redisPhone}`,
      `chat_unread_${_redisPhone}`,
      `typing_${_redisPhone}`,
      `human_read_${_redisPhone}`,
      `delivery_mode_${_redisPhone}`,
      `delivery_bot_silence_${_redisPhone}`,
      `blocked_${_redisPhone}`,
      `profile_pic_${_redisPhone}`,
    ];
    try {
      const phoneKeys = await redis.keys(`profile_pic_*${phone10}*`);
      if (phoneKeys?.length) keys.push(...phoneKeys);
    } catch {}
    await Promise.all([...new Set(keys)].map(key => redis.del(key)));
    await redis.srem?.('chat_phones', _redisPhone);
  }));

  return expired.length;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get('limit') || `${CHAT_PAGE_SIZE}`, 10);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    const searchQuery = (searchParams.get('search') || '').toLowerCase().trim();
    const limit = Math.min(Math.max(Number.isFinite(limitParam) ? limitParam : CHAT_PAGE_SIZE, 1), 200);
    const offset = Math.max(Number.isFinite(offsetParam) ? offsetParam : 0, 0);

    // ── Set O(1) primero; fallback a redis.keys si el set está vacío ──
    let phones = [];
    const setMembers = await redis.smembers?.('chat_phones') ?? [];
    if (setMembers && setMembers.length > 0) {
      phones = setMembers;
    } else {
      const keysRaw = await redis.keys('chat_hist_*@c.us');
      phones = (keysRaw || []).map(k => k.replace('chat_hist_', '').replace('@c.us', ''));
      // Poblar el Set para próximas llamadas
      if (phones.length > 0) {
        for (const p of phones) await redis.sadd?.('chat_phones', p);
      }
    }
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

    // Inject each pinned group into the phones arrays
    for (const [gId, gName] of Object.entries(allPinnedMap)) {
      let gCleanPhone = normalizeChatPhone(gId.startsWith('group_') ? gId.replace('group_', '') : gId);
      const gPhoneIndex = phones.indexOf(gCleanPhone);
      if (gPhoneIndex !== -1) {
        // Replace the "phone" with the group ID so frontend can respond
        phones[gPhoneIndex] = gId;
      } else {
        phones.push(gId);
      }
    }

    if (!phones || phones.length === 0) {
      return NextResponse.json({ success: true, chats: [], total: 0, limit, offset, nextOffset: null, hasMore: false, deletedOld: 0 });
    }

    const entries = phones.map(phone => {
      let redisPhone;
      if (phone.includes('@g.us')) redisPhone = normalizeChatPhone(phone);
      else if (phone.startsWith('group_')) redisPhone = normalizeChatPhone(phone.replace('group_', ''));
      else redisPhone = normalizeChatPhone(phone);
      return { phone, redisPhone };
    });

    // Batch: build all metadata keys and fetch in one mget
    const stateKeys = entries.flatMap(({ redisPhone }) => {
      return [
        `client_name_${redisPhone}`,
        `chat_unread_${redisPhone}`,
        `client_store_${redisPhone}`,
        `human_read_${redisPhone}`,
        `delivery_mode_${redisPhone}`,
        `delivery_bot_silence_${redisPhone}`,
        `blocked_${redisPhone}`
      ];
    });
    const chatMetaKeys = entries.map(({ redisPhone }) => `chat_meta_${redisPhone}`);

    const [chatMetaResults, stateResults] = await Promise.all([
      chatMetaKeys.length > 0 ? redis.mget(...chatMetaKeys) : [],
      stateKeys.length > 0 ? redis.mget(...stateKeys) : []
    ]);

    const chatMetas = chatMetaResults.map(m => m ? (typeof m === 'string' ? JSON.parse(m) : m) : null);
    const missingMeta = entries
      .map((entry, i) => ({ ...entry, i }))
      .filter(({ i }) => !chatMetas[i]);

    if (missingMeta.length > 0) {
      const missingHistKeys = missingMeta.map(({ redisPhone }) => `chat_hist_${redisPhone}@c.us`);
      const missingHist = await redis.mget(...missingHistKeys);
      await Promise.all(missingMeta.map(async ({ redisPhone, i }, idx) => {
        const histData = missingHist[idx] || await redis.get(`chat_hist_${redisPhone}`);
        const parsed = typeof histData === 'string' ? JSON.parse(histData) : (histData || []);
        chatMetas[i] = await saveChatMeta(redisPhone, parsed);
      }));
    }

    const chats = entries.map(({ phone, redisPhone }, i) => {
      try {
        const base = i * 7;
        const cachedName = stateResults[base] || null;
        const unreadRaw = stateResults[base + 1] || '0';
        const cachedStore = stateResults[base + 2] || '';
        const humanRead = stateResults[base + 3] || null;
        const deliveryMode = stateResults[base + 4] || null;
        const botSilence = stateResults[base + 5] || null;
        const isBlocked = stateResults[base + 6] || null;
        const chatMeta = chatMetas[i];

        let name = String(cachedName ?? phone.slice(-10));
        let isGroup = false;
        if (allPinnedMap[phone]) {
          name = `📌 ${allPinnedMap[phone]}`;
          isGroup = true;
        }

        return {
          _redisPhone: redisPhone,
          phone,
          name,
          lastText: chatMeta?.lastText || '',
          lastTs: chatMeta?.lastTs || 0,
          lastStatus: chatMeta?.lastStatus || (chatMeta?.fromMe ? 'sent' : null),
          fromMe: !!chatMeta?.fromMe,
          unread: parseInt(unreadRaw || '0'),
          msgCount: chatMeta?.msgCount || 0,
          store: cachedStore || '',
          needsHuman: !humanRead && (chatMeta?.msgCount || 0) > 0,
          deliveryMode: !!deliveryMode,
          botSilent: !!botSilence,
          isBlocked: !!isBlocked,
          isGroup
        };
      } catch {
        return { _redisPhone: entries[i]?.redisPhone, phone, name: allPinnedMap[phone] ? `📌 ${allPinnedMap[phone]}` : phone.slice(-10), lastText: '', lastTs: 0, lastStatus: null, fromMe: false, unread: 0, msgCount: 0, store: '', needsHuman: false, deliveryMode: false, botSilent: false, isGroup: !!allPinnedMap[phone] };
      }
    });

    const deletedOld = await purgeExpiredChats(chats);
    const liveChats = chats.filter(c => !(
      !c.isGroup &&
      c._redisPhone &&
      c.lastTs > 0 &&
      c.lastTs < Date.now() - CHAT_RETENTION_MS &&
      (c.msgCount || 0) > 0
    ));

    liveChats.sort((a, b) => {
      if (a.isGroup && !b.isGroup) return -1;
      if (!a.isGroup && b.isGroup) return 1;
      return (b.lastTs || 0) - (a.lastTs || 0);
    });
    const searchFiltered = searchQuery
      ? liveChats.filter(c =>
          c.name.toLowerCase().includes(searchQuery) ||
          c.phone.replace(/\D/g, '').includes(searchQuery.replace(/\D/g, ''))
        )
      : liveChats;

    const total = searchFiltered.length;
    const page = searchFiltered.slice(offset, offset + limit).map(({ _redisPhone, ...chat }) => chat);
    const nextOffset = offset + page.length;
    return NextResponse.json({
      success: true,
      chats: page,
      total,
      limit,
      offset,
      nextOffset: nextOffset < total ? nextOffset : null,
      hasMore: nextOffset < total,
      deletedOld,
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message, chats: [], total: 0, limit: CHAT_PAGE_SIZE, offset: 0, nextOffset: null, hasMore: false, deletedOld: 0 });
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
      `chat_meta_${rawPhone}`, `chat_meta_${cleanPhone}`,
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
    await redis.srem('chat_phones', cleanPhone);

    return NextResponse.json({ success: true, deletedFromLoyverse });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
