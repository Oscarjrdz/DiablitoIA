import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let phone = searchParams.get('phone') || '';
  phone = phone.replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;
  if (!phone) return NextResponse.json({ url: null });

  // Check cache (24h)
  const cached = await redis.get(`profile_pic_${phone}`);
  if (cached !== null) return NextResponse.json({ url: cached || null });

  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!cfg.wappInstance || !cfg.wappToken) return NextResponse.json({ url: null });

    const base = `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}`;
    const jid = `${phone}@c.us`;

    // Try common WPP-style profile picture endpoints
    let picUrl = null;
    const attempts = [
      { method: 'GET', url: `${base}/profile-pic?number=${jid}&token=${cfg.wappToken}` },
      { method: 'POST', url: `${base}/profile-pic`, body: { token: cfg.wappToken, number: jid } },
      { method: 'POST', url: `${base}/contact/profile-pic`, body: { token: cfg.wappToken, contactId: jid } },
    ];

    for (const attempt of attempts) {
      try {
        const fetchOpts = { method: attempt.method, headers: { 'Content-Type': 'application/json' } };
        if (attempt.body) fetchOpts.body = JSON.stringify(attempt.body);
        const res = await fetch(attempt.url, fetchOpts);
        if (res.ok) {
          const data = await res.json();
          const url = data?.profilePicUrl || data?.url || data?.imgUrl || data?.picture || null;
          if (url && url.startsWith('http')) { picUrl = url; break; }
        }
      } catch {}
    }

    // Cache result (even null = "no pic") for 24h
    await redis.setex(`profile_pic_${phone}`, 86400, picUrl || '');
    return NextResponse.json({ url: picUrl });
  } catch (e) {
    return NextResponse.json({ url: null });
  }
}

// Invalidate cache for a phone
export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  let phone = (searchParams.get('phone') || '').replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;
  await redis.del(`profile_pic_${phone}`);
  return NextResponse.json({ success: true });
}
