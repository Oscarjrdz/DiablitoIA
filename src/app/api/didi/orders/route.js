import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const DIDI_API = 'https://api.didi-food.com/api/v1/integration/order';

async function getDidiToken() {
  const cfg = await redis.get('didi_config');
  return typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
}

// GET → lista de pedidos pendientes
export async function GET() {
  try {
    const raw = await redis.lrange('didi_pending_orders', 0, 49);
    const orders = raw.map(r => {
      try { return JSON.parse(r); } catch { return null; }
    }).filter(Boolean);
    return NextResponse.json({ success: true, orders });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST → aceptar o rechazar un pedido
// body: { action: 'accept' | 'deny', order_external_id, delivery_id, store_id, message? }
export async function POST(req) {
  try {
    const { action, order_external_id, delivery_id, store_id, message } = await req.json();
    const cfg = await getDidiToken();

    if (!cfg.accessToken) {
      return NextResponse.json({ success: false, error: 'No hay accessToken de Didi configurado en didi_config' }, { status: 400 });
    }

    const endpoint = action === 'accept' ? `${DIDI_API}/accept` : `${DIDI_API}/deny`;
    const body = {
      delivery_id,
      store_id,
      order_external_id,
      ...(action === 'deny' && message ? { message } : {})
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.accessToken}`
      },
      body: JSON.stringify(body)
    });

    const data = res.ok ? await res.json().catch(() => ({})) : await res.text();

    // Actualizamos estado en Redis
    const orderKey = `didi_order_${order_external_id}`;
    const existing = await redis.get(orderKey);
    if (existing) {
      const order = typeof existing === 'string' ? JSON.parse(existing) : existing;
      order.status = action === 'accept' ? 'accepted' : 'denied';
      await redis.setex(orderKey, 86400 * 7, JSON.stringify(order));
    }

    return NextResponse.json({ success: res.ok, didi_response: data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
