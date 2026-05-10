import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let rawPhone = searchParams.get('phone') || '';
  if (!rawPhone) return NextResponse.json({ url: null });

  let isGroup = rawPhone.includes('@g.us');
  let redisPhone = rawPhone;
  let fetchTo = rawPhone;

  if (isGroup) {
    redisPhone = '52' + rawPhone.replace(/\D/g, '').slice(-10);
    fetchTo = rawPhone; // Keep @g.us
  } else {
    redisPhone = rawPhone.replace(/\D/g, '');
    if (!redisPhone.startsWith('52')) redisPhone = '52' + redisPhone;
    fetchTo = `${redisPhone}@c.us`;
  }

  // Caché 24h — string vacío significa "sin foto"
  const cached = await redis.get(`profile_pic_${redisPhone}`);
  if (cached !== null) return NextResponse.json({ url: cached || null });

  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!cfg.wappInstance || !cfg.wappToken) return NextResponse.json({ url: null });

    // Use /group/profilePic for groups, /contacts/profile-picture for normal contacts
    let url = isGroup 
        ? `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/group/profilePic?token=${cfg.wappToken}&groupJid=${fetchTo}`
        : `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/contacts/profile-picture?token=${cfg.wappToken}&to=${fetchTo}`;

    const res = await fetch(url);
    const picData = res.ok ? await res.json() : null;
    let picUrl = null;
    if (isGroup) {
       picUrl = picData?.profilePic || picData?.data?.profilePic || null;
    } else {
       picUrl = picData?.profile_picture || null;
    }

    await redis.setex(`profile_pic_${redisPhone}`, 86400, picUrl || '');
    return NextResponse.json({ url: picUrl });
  } catch {
    return NextResponse.json({ url: null });
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  let phone = (searchParams.get('phone') || '').replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;
  await redis.del(`profile_pic_${phone}`);
  return NextResponse.json({ success: true });
}
