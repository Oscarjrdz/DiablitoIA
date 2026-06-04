import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

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
      return NextResponse.json({ success: false, error: 'Gateway no configurado (instance/token faltante)' });
    }

    // Verificar que la sesión esté conectada antes de bloquear
    let sessionConnected = false;
    try {
      const statusRes = await fetch(`${GW}/${cfg.wappInstance}/status?token=${cfg.wappToken}`);
      const statusData = await statusRes.json().catch(() => ({}));
      sessionConnected = statusData?.status === 'authenticated' || statusData?.connected === true || statusData?.state === 'open';
      console.log('[Block] Session status:', JSON.stringify(statusData));
    } catch (e) {
      console.error('[Block] Status check failed:', e.message);
    }

    if (!sessionConnected) {
      return NextResponse.json({
        success: false,
        error: 'La sesión de WhatsApp no está conectada. Verifica el estado en el gateway.'
      });
    }

    // Bloquear/desbloquear en el gateway
    let gatewayOk = false;
    let gatewayResponse = null;
    let gatewayData = null;
    try {
      const url = `${GW}/${cfg.wappInstance}/contacts/block`;
      const body2 = { token: cfg.wappToken, number, action: blocked ? 'block' : 'unblock' };
      console.log('[Block] Calling:', url, JSON.stringify({ ...body2, token: '***' }));
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body2)
      });
      const text = await res.text().catch(() => '');
      gatewayResponse = text;
      gatewayOk = res.ok;
      console.log('[Block] Gateway status:', res.status, 'body:', text);
      try { gatewayData = JSON.parse(text); } catch {}
    } catch (e) {
      console.error('[Block] Gateway unreachable:', e.message);
      gatewayResponse = e.message;
    }

    const gatewaySuccess = gatewayData?.success === true;

    // Solo actualizar Redis si el gateway confirmó
    if (gatewaySuccess) {
      if (blocked) {
        await redis.set(`blocked_${cleanPhone}`, '1');
      } else {
        await redis.del(`blocked_${cleanPhone}`);
      }
    }

    if (!gatewaySuccess) {
      const errMsg = gatewayData?.error === 'bad-request'
        ? 'WhatsApp rechazó la acción — el número puede no existir en WhatsApp'
        : (gatewayResponse || 'Sin respuesta del gateway');
      return NextResponse.json({ success: false, error: errMsg });
    }

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
