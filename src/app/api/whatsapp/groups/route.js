import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { publishChatEvent } from '@/lib/realtime';

// GET — List all WhatsApp groups
export async function GET() {
  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    let groups = [];
    const foundIds = new Set();

    // 1) Scan Redis for known group JIDs (saved by webhook)
    try {
      const groupJidKeys = await redis.keys('group_jid_*');
      if (groupJidKeys && groupJidKeys.length > 0) {
        const cleanPhones = groupJidKeys.map(k => k.replace('group_jid_', ''));
        const subjectKeys = cleanPhones.map(p => `group_subject_${p}`);
        const nameKeys = cleanPhones.map(p => `client_name_${p}`);

        const [jidResults, subjectResults, nameResults] = await Promise.all([
          redis.mget(...groupJidKeys),
          subjectKeys.length > 0 ? redis.mget(...subjectKeys) : [],
          nameKeys.length > 0 ? redis.mget(...nameKeys) : []
        ]);

        for (let i = 0; i < cleanPhones.length; i++) {
          const jid = jidResults[i];
          const subject = subjectResults[i] || null;
          const cachedName = nameResults[i] || null;
          if (jid && jid.includes('@g.us') && !foundIds.has(jid)) {
            foundIds.add(jid);
            groups.push({
              id: jid,
              name: subject || (cachedName ? cachedName.replace('📌 ', '') : `Grupo ${cleanPhones[i].slice(-10)}`),
              participants: 0,
              picture: null,
              cleanPhone: cleanPhones[i]
            });
          }
        }
      }
    } catch (e) {
      console.error('Redis group scan error:', e);
    }

    // 2) Also check debug_group_payload for JIDs that webhook already captured
    try {
      const debugPayloads = await redis.lrange('debug_group_payload', 0, 50);
      if (debugPayloads && debugPayloads.length > 0) {
        for (const raw of debugPayloads) {
          try {
            const dp = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const fromJid = dp.from || '';
            if (fromJid.includes('@g.us') && !foundIds.has(fromJid)) {
              foundIds.add(fromJid);
              const cleanPhone = '52' + fromJid.replace(/\D/g, '').slice(-10);
              // Save the mapping for future use
              await redis.set(`group_jid_${cleanPhone}`, fromJid);
              const cachedName = await redis.get(`client_name_${cleanPhone}`);
              groups.push({
                id: fromJid,
                name: cachedName ? cachedName.replace('📌 ', '') : `Grupo ${cleanPhone.slice(-10)}`,
                participants: 0,
                picture: null,
                cleanPhone
              });
            }
          } catch {}
        }
      }
    } catch {}

    // 3) Check ventas_grupo_id (legacy) 
    try {
      const legacyGroupId = await redis.get('ventas_grupo_id');
      if (legacyGroupId && legacyGroupId.includes('@g.us') && !foundIds.has(legacyGroupId)) {
        foundIds.add(legacyGroupId);
        const cleanPhone = '52' + legacyGroupId.replace(/\D/g, '').slice(-10);
        await redis.set(`group_jid_${cleanPhone}`, legacyGroupId);
        groups.push({
          id: legacyGroupId,
          name: 'Grupo Ventas',
          participants: 0,
          picture: null,
          cleanPhone
        });
      }
    } catch {}

    // 4) Detect groups from chat histories (messages with sender pattern "Name (number):")
    try {
      const chatKeys = await redis.keys('chat_hist_*@c.us');
      if (chatKeys && chatKeys.length > 0) {
        // Check only chats that don't have a group_jid mapping yet
        const existingCleanPhones = new Set(groups.map(g => g.cleanPhone));
        const potentialGroupKeys = chatKeys.filter(k => {
          const cp = k.replace('chat_hist_', '').replace('@c.us', '');
          return !existingCleanPhones.has(cp);
        });

        // Sample up to 30 chats to check
        for (const key of potentialGroupKeys.slice(0, 30)) {
          try {
            const hist = await redis.get(key);
            if (!hist) continue;
            const parsed = typeof hist === 'string' ? JSON.parse(hist) : hist;
            if (!parsed.length) continue;
            // Check last few messages for group sender pattern: "Name (digits):"
            const lastMsgs = parsed.slice(-3);
            const isGroup = lastMsgs.some(m => {
              const txt = m.parts?.[0]?.text || '';
              return /^.+\s\(\d{5,}\):\s/.test(txt);
            });
            if (isGroup) {
              const cleanPhone = key.replace('chat_hist_', '').replace('@c.us', '');
              // Check if we already have a JID for this
              const existingJid = await redis.get(`group_jid_${cleanPhone}`);
              if (existingJid && !foundIds.has(existingJid)) {
                foundIds.add(existingJid);
                groups.push({
                  id: existingJid,
                  name: `Grupo ${cleanPhone.slice(-10)}`,
                  participants: 0,
                  picture: null,
                  cleanPhone
                });
              } else if (!existingJid) {
                // We know it's a group but don't have the JID
                // Use the cleanPhone as a placeholder ID
                const fakeId = `group_${cleanPhone}`;
                if (!foundIds.has(fakeId)) {
                  foundIds.add(fakeId);
                  groups.push({
                    id: fakeId,
                    name: `Grupo ${cleanPhone.slice(-10)}`,
                    participants: 0,
                    picture: null,
                    cleanPhone,
                    needsJid: true
                  });
                }
              }
            }
          } catch {}
        }
      }
    } catch {}

    // 5) If still empty, try gateway
    if (groups.length === 0 && cfg.wappInstance && cfg.wappToken) {
      const base = `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}`;
      const endpoints = [
        `${base}/groups?token=${cfg.wappToken}`,
        `${base}/group/fetchAllGroups?token=${cfg.wappToken}`,
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (res.ok) {
            const data = await res.json();
            const rawGroups = Array.isArray(data) ? data : (data.data || data.groups || []);
            if (rawGroups.length > 0) {
              groups = rawGroups.map(g => ({
                id: g.id || g.jid || g.groupId || '',
                name: g.subject || g.name || g.groupName || 'Grupo',
                participants: g.size || g.participants?.length || 0,
                picture: g.pictureUrl || g.profilePicture || null
              })).filter(g => g.id && g.id.includes('@g.us'));
              break;
            }
          }
        } catch {}
      }
    }

    // Get currently pinned groups
    const pinnedRaw = await redis.get('pinned_groups');
    const pinned = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    return NextResponse.json({
      success: true,
      groups,
      pinned,
      count: groups.length
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

// POST — Pin a group
export async function POST(req) {
  try {
    const { groupId, groupName } = await req.json();
    if (!groupId) return NextResponse.json({ success: false, error: 'groupId required' });

    const pinnedRaw = await redis.get('pinned_groups');
    const pinned = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    if (pinned.find(g => g.id === groupId)) {
      return NextResponse.json({ success: true, note: 'already_pinned' });
    }

    pinned.push({ id: groupId, name: groupName || 'Grupo' });
    await redis.set('pinned_groups', JSON.stringify(pinned));

    // Set group name in Redis for the chat list
    let cleanPhone;
    if (groupId.includes('@g.us')) {
      cleanPhone = '52' + groupId.replace(/\D/g, '').slice(-10);
    } else if (groupId.startsWith('group_')) {
      cleanPhone = groupId.replace('group_', '');
    } else {
      cleanPhone = groupId;
    }
    const histKey = `chat_hist_${cleanPhone}@c.us`;
    const histExists = await redis.get(histKey);
    if (!histExists) {
      await redis.set(histKey, JSON.stringify([]));
    }
    await redis.set(`client_name_${cleanPhone}`, `📌 ${groupName || 'Grupo'}`);
    await publishChatEvent({ phone: groupId, redisPhone: cleanPhone, reason: 'group-pin' });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

// PATCH — Rename a pinned group
export async function PATCH(req) {
  try {
    const { groupId, newName } = await req.json();
    if (!groupId || !newName) return NextResponse.json({ success: false, error: 'groupId and newName required' });

    const pinnedRaw = await redis.get('pinned_groups');
    const pinned = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    const group = pinned.find(g => g.id === groupId);
    if (!group) return NextResponse.json({ success: false, error: 'Group not pinned' });

    group.name = newName.trim();
    await redis.set('pinned_groups', JSON.stringify(pinned));

    let cleanPhone;
    if (groupId.includes('@g.us')) {
      cleanPhone = '52' + groupId.replace(/\D/g, '').slice(-10);
    } else if (groupId.startsWith('group_')) {
      cleanPhone = groupId.replace('group_', '');
    } else {
      cleanPhone = groupId;
    }
    await redis.set(`client_name_${cleanPhone}`, `📌 ${newName.trim()}`);
    await publishChatEvent({ phone: groupId, redisPhone: cleanPhone, reason: 'group-rename' });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

// DELETE — Unpin a group
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get('groupId');
    if (!groupId) return NextResponse.json({ success: false, error: 'groupId required' });

    const pinnedRaw = await redis.get('pinned_groups');
    const pinned = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    const updated = pinned.filter(g => g.id !== groupId);
    await redis.set('pinned_groups', JSON.stringify(updated));
    await publishChatEvent({ reason: 'group-unpin' });

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
