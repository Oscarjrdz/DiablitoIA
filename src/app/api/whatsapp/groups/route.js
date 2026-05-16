import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// GET — List all WhatsApp groups from the gateway
export async function GET() {
  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!cfg.wappInstance || !cfg.wappToken) {
      return NextResponse.json({ success: false, error: 'No WhatsApp config' });
    }

    const base = `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}`;
    let groups = [];

    // Try multiple gateway endpoints (different API versions)
    const endpoints = [
      `${base}/groups?token=${cfg.wappToken}`,
      `${base}/group/fetchAllGroups?token=${cfg.wappToken}`,
      `${base}/chat/fetchAllGroups?token=${cfg.wappToken}`,
      `${base}/group/fetchAllGroups/${cfg.wappInstance}?token=${cfg.wappToken}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          const rawGroups = Array.isArray(data) ? data : (data.data || data.groups || []);
          if (rawGroups.length > 0) {
            groups = rawGroups.map(g => ({
              id: g.id || g.jid || g.groupId || g.chatId || '',
              name: g.subject || g.name || g.groupName || g.chatName || 'Grupo',
              participants: g.size || g.participants?.length || g.memberCount || 0,
              picture: g.pictureUrl || g.profilePicture || g.imgUrl || null
            })).filter(g => g.id && g.id.includes('@g.us'));
            break; // Found groups, stop trying
          }
        }
      } catch {}
    }

    // Save gateway debug info
    await redis.set('debug_groups_found', JSON.stringify({ count: groups.length, ids: groups.map(g => g.id) }));

    // Get currently pinned groups (with custom names)
    const pinnedRaw = await redis.get('pinned_groups');
    const pinned = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    // Also include ventas_grupo_id (legacy single group)
    const legacyGroup = await redis.get('ventas_grupo_id');

    return NextResponse.json({
      success: true,
      groups,
      pinned,
      legacyGroup
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

// POST — Pin a group (add to pinned_groups list)
export async function POST(req) {
  try {
    const { groupId, groupName } = await req.json();
    if (!groupId) return NextResponse.json({ success: false, error: 'groupId required' });

    const pinnedRaw = await redis.get('pinned_groups');
    const pinned = pinnedRaw ? (typeof pinnedRaw === 'string' ? JSON.parse(pinnedRaw) : pinnedRaw) : [];

    // Don't duplicate
    const existing = pinned.find(g => g.id === groupId);
    if (existing) {
      return NextResponse.json({ success: true, note: 'already_pinned' });
    }

    pinned.push({ id: groupId, name: groupName || 'Grupo' });
    await redis.set('pinned_groups', JSON.stringify(pinned));

    // Initialize empty chat history for the group if not exists
    const cleanPhone = '52' + groupId.replace(/\D/g, '').slice(-10);
    const histKey = `chat_hist_${cleanPhone}@c.us`;
    const histExists = await redis.get(histKey);
    if (!histExists) {
      await redis.set(histKey, JSON.stringify([]));
    }
    // Set group name in Redis
    await redis.set(`client_name_${cleanPhone}`, `📌 ${groupName || 'Grupo'}`);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}

// PATCH — Rename a pinned group (local name only)
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

    // Also update the cached name in Redis
    const cleanPhone = '52' + groupId.replace(/\D/g, '').slice(-10);
    await redis.set(`client_name_${cleanPhone}`, `📌 ${newName.trim()}`);

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

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
