import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const GW = 'https://gatewaywapp-production.up.railway.app';

export async function POST(req) {
  try {
    const { phone, fullName, firstName } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });
    if (!fullName?.trim()) return NextResponse.json({ success: false, error: 'fullName requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (!cfg.wappInstance || !cfg.wappToken) {
      return NextResponse.json({ success: false, error: 'Gateway no configurado (falta instance o token)' });
    }

    const url = `${GW}/${cfg.wappInstance}/contacts/save`;
    const body = {
      token: cfg.wappToken,
      number: cleanPhone,
      fullName: fullName.trim(),
      ...(firstName?.trim() ? { firstName: firstName.trim() } : {})
    };

    let gatewayData = null;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.wappToken}`
        },
        body: JSON.stringify(body)
      });
      const text = await res.text().catch(() => '');
      console.log('[ContactSave] status:', res.status, 'body:', text);
      try { gatewayData = JSON.parse(text); } catch {}
    } catch (e) {
      console.error('[ContactSave] fetch error:', e.message);
      return NextResponse.json({ success: false, error: 'Gateway inalcanzable: ' + e.message });
    }

    if (gatewayData?.success !== true) {
      const errMsg = gatewayData?.message || gatewayData?.error || JSON.stringify(gatewayData) || 'Sin respuesta del gateway';
      return NextResponse.json({ success: false, error: errMsg });
    }

    return NextResponse.json({ success: true, jid: gatewayData.jid, fullName: gatewayData.fullName });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
