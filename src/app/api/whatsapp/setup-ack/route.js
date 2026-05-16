import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// Activa webhook_message_ack en el gateway para que lleguen las palomitas de entregado/leído
export async function GET() {
  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (!cfg.wappInstance || !cfg.wappToken) {
      return NextResponse.json({ success: false, error: 'No hay wapp_config en Redis' });
    }

    const res = await fetch(
      `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/settings/webhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cfg.wappToken,
          webhook_message_ack: true
        })
      }
    );

    const data = await res.json();
    return NextResponse.json({ success: res.ok, gateway_response: data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
