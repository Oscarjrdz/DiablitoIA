import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { publishChatEvent } from '@/lib/realtime';

const GW = 'https://gatewaywapp-production.up.railway.app';

export async function POST(req) {
  try {
    const { phone, blocked } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
    const number = cleanPhone;

    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (!cfg.wappInstance || !cfg.wappToken) {
      return NextResponse.json({ success: false, error: 'Gateway no configurado (falta instance o token)' });
    }

    const url = `${GW}/${cfg.wappInstance}/contacts/block`;
    const body2 = { token: cfg.wappToken, number, action: blocked ? 'block' : 'unblock' };

    let gatewayData = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body2)
      });
      const text = await res.text().catch(() => '');
      console.log('[Block] status:', res.status, 'body:', text);
      try { gatewayData = JSON.parse(text); } catch {}
    } catch (e) {
      console.error('[Block] fetch error:', e.message);
      return NextResponse.json({ success: false, error: 'Gateway inalcanzable: ' + e.message });
    }

    if (gatewayData?.success !== true) {
      const errMsg = gatewayData?.error === 'bad-request'
        ? 'WhatsApp rechazó la acción — verifica que el número tenga WhatsApp activo'
        : (JSON.stringify(gatewayData) || 'Sin respuesta del gateway');
      return NextResponse.json({ success: false, error: errMsg });
    }

    // Solo actualizar Redis si el gateway confirmó éxito
    if (blocked) {
      await redis.set(`blocked_${cleanPhone}`, '1');
    } else {
      await redis.del(`blocked_${cleanPhone}`);
    }
    await publishChatEvent({ phone, redisPhone: cleanPhone, reason: 'block-state' });

    return NextResponse.json({ success: true, blocked: !!blocked });
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
