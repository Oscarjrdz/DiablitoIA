import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const GW = 'https://gatewaywapp-production.up.railway.app';

export async function POST(req) {
  try {
    const { phone, blocked } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
    const number = `${cleanPhone}@c.us`;

    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    // Bloquear/desbloquear en el gateway de WhatsApp
    let gatewayOk = false;
    if (cfg.wappInstance && cfg.wappToken) {
      try {
        const res = await fetch(`${GW}/${cfg.wappInstance}/contacts/block`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: cfg.wappToken,
            number,
            action: blocked ? 'block' : 'unblock'
          })
        });
        gatewayOk = res.ok;
        if (!res.ok) console.error('[Block] Gateway error:', await res.text().catch(() => ''));
      } catch (e) {
        console.error('[Block] Gateway unreachable:', e.message);
      }
    }

    // Actualizar estado en Redis
    if (blocked) {
      await redis.set(`blocked_${cleanPhone}`, '1');
    } else {
      await redis.del(`blocked_${cleanPhone}`);
    }

    return NextResponse.json({ success: true, blocked: !!blocked, gatewayOk });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const phone = (searchParams.get('phone') || '').replace(/\D/g, '');
  if (!phone) return NextResponse.json({ success: false });
  const cleanPhone = phone.startsWith('52') ? phone : '52' + phone;
  const val = await redis.get(`blocked_${cleanPhone}`);
  return NextResponse.json({ success: true, blocked: !!val });
}
