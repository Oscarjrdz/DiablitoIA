import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const GW = 'https://gatewaywapp-production.up.railway.app';

export async function POST(req) {
  try {
    const { phone, blocked } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
    const number = cleanPhone; // gateway rechaza @c.us en este endpoint

    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    // Bloquear/desbloquear en el gateway de WhatsApp
    let gatewayOk = false;
    let gatewayResponse = null;
    if (cfg.wappInstance && cfg.wappToken) {
      try {
        const url = `${GW}/${cfg.wappInstance}/contacts/block`;
        const body2 = { token: cfg.wappToken, number, action: blocked ? 'block' : 'unblock' };
        console.log('[Block] Calling gateway:', url, JSON.stringify(body2));
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body2)
        });
        const text = await res.text().catch(() => '');
        gatewayResponse = text;
        gatewayOk = res.ok;
        console.log('[Block] Gateway status:', res.status, 'body:', text);
      } catch (e) {
        console.error('[Block] Gateway unreachable:', e.message);
        gatewayResponse = e.message;
      }
    } else {
      gatewayResponse = `No config: instance=${cfg.wappInstance} token=${!!cfg.wappToken}`;
    }

    // Actualizar estado en Redis independientemente del gateway
    if (blocked) {
      await redis.set(`blocked_${cleanPhone}`, '1');
    } else {
      await redis.del(`blocked_${cleanPhone}`);
    }

    // Parsear respuesta del gateway para dar más detalle
    let gatewayData = null;
    try { gatewayData = JSON.parse(gatewayResponse); } catch {}

    return NextResponse.json({
      success: true,
      blocked: !!blocked,
      gatewayOk,
      gatewayResponse,
      gatewaySuccess: gatewayData?.success === true,
      debug: {
        instance: cfg.wappInstance || null,
        hasToken: !!cfg.wappToken,
        number,
        url: cfg.wappInstance ? `${GW}/${cfg.wappInstance}/contacts/block` : null
      }
    });
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
