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

    // Fetch groups from gateway (Evolution API / Baileys)
    const res = await fetch(
      `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/groups?token=${cfg.wappToken}`,
      { signal: AbortSignal.timeout(10000) }
    );

    let groups = [];
    if (res.ok) {
      const data = await res.json();
      // Evolution API returns array or { data: [...] }
      const rawGroups = Array.isArray(data) ? data : (data.data || data.groups || []);
      groups = rawGroups.map(g => ({
        id: g.id || g.jid || g.groupId || '',
        name: g.subject || g.name || g.groupName || 'Grupo',
        participants: g.size || g.participants?.length || 0,
        picture: g.pictureUrl || g.profilePicture || null
      })).filter(g => g.id);
    }

    // Get currently pinned groups
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
    if (pinned.find(g => g.id === groupId)) {
      return NextResponse.json({ success: true, note: 'already_pinned' });
    }

    pinned.push({ id: groupId, name: groupName || 'Grupo' });
    await redis.set('pinned_groups', JSON.stringify(pinned));

    // Initialize empty chat history for the group if not exists
    const cleanPhone = '52' + groupId.replace(/\D/g, '').slice(-10);
    const histKey = `chat_hist_${cleanPhone}@c.us`;
    const existing = await redis.get(histKey);
    if (!existing) {
      await redis.set(histKey, JSON.stringify([]));
    }
    // Set group name in Redis
    await redis.set(`client_name_${cleanPhone}`, `📌 ${groupName || 'Grupo'}`);

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
