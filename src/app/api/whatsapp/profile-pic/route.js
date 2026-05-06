import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let phone = (searchParams.get('phone') || '').replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;
  if (!phone) return NextResponse.json({ url: null });

  // Caché 24h — string vacío significa "sin foto"
  const cached = await redis.get(`profile_pic_${phone}`);
  if (cached !== null) return NextResponse.json({ url: cached || null });

  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!cfg.wappInstance || !cfg.wappToken) return NextResponse.json({ url: null });

    const url = `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/contacts/profile-picture`
      + `?token=${cfg.wappToken}&to=${phone}@c.us`;

    const res = await fetch(url);
    const picUrl = res.ok ? (await res.json())?.profile_picture || null : null;

    await redis.setex(`profile_pic_${phone}`, 86400, picUrl || '');
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
