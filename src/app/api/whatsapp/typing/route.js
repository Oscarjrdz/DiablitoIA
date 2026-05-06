import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// Enviar estado de "escribiendo" a un contacto
export async function POST(req) {
  try {
    const { phone, typing } = await req.json();
    if (!phone) return NextResponse.json({ success: false });

    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!cfg.wappInstance || !cfg.wappToken) return NextResponse.json({ success: false });

    const base = `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}`;
    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
    const jid = `${cleanPhone}@c.us`;

    // Try common presence/typing endpoints
    const attempts = [
      { url: `${base}/typing`, body: { token: cfg.wappToken, to: jid, typing: !!typing } },
      { url: `${base}/presence`, body: { token: cfg.wappToken, to: jid, status: typing ? 'composing' : 'available' } },
      { url: `${base}/send-typing`, body: { token: cfg.wappToken, to: jid, duration: typing ? 5000 : 0 } },
    ];

    for (const a of attempts) {
      try {
        const res = await fetch(a.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(a.body)
        });
        if (res.ok) break;
      } catch {}
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false });
  }
}
