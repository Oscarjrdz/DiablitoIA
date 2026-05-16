import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// Didi Food manda un GET para verificar la URL callback cuando la registras
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  // Algunos gateways mandan un challenge/token para verificar
  const challenge = searchParams.get('challenge') || searchParams.get('token') || searchParams.get('verify_token');
  // Loggeamos los query params para saber qué nos mandan en la verificación
  await redis.setex('didi_verify_request', 86400, JSON.stringify({
    ts: Date.now(),
    params: Object.fromEntries(searchParams.entries())
  }));
  if (challenge) return new Response(challenge, { status: 200 });
  return new Response('OK', { status: 200 });
}

// Didi Food manda un POST cuando llega un pedido nuevo
export async function POST(req) {
  try {
    const rawText = await req.text();
    const ts = Date.now();

    // Guardamos el payload crudo en Redis para inspeccionarlo
    const logKey = `didi_order_raw_${ts}`;
    await redis.setex(logKey, 60 * 60 * 24 * 7, rawText); // 7 días

    // Mantenemos lista de últimos 50 pedidos recibidos
    await redis.lpush('didi_orders_log', JSON.stringify({ ts, raw: rawText }));
    await redis.ltrim('didi_orders_log', 0, 49);

    // Intentamos parsear como JSON para extraer info útil
    let body = {};
    try { body = JSON.parse(rawText); } catch {}

    // Extraemos campos comunes de APIs de delivery (nos adaptamos cuando veamos el formato real)
    const orderId   = body?.order_id   || body?.orderId   || body?.id        || body?.data?.order_id || '—';
    const status    = body?.status     || body?.orderStatus || body?.data?.status || '—';
    const total     = body?.total      || body?.totalAmount || body?.data?.total  || '—';
    const items     = body?.items      || body?.orderItems  || body?.data?.items  || [];
    const storeName = body?.store_name || body?.restaurant?.name || body?.data?.store_name || '—';
    const clientName = body?.customer?.name || body?.user?.name || body?.data?.customer_name || '—';
    const address   = body?.delivery?.address || body?.address || body?.data?.address || '—';

    // Notificamos por WhatsApp al número configurado
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (cfg.wappInstance && cfg.wappToken && cfg.notifyPhone) {
      const hora = new Date().toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey'
      });

      let itemLines = '';
      if (Array.isArray(items) && items.length > 0) {
        itemLines = items.map(it => {
          const name = it.name || it.item_name || it.product_name || '?';
          const qty  = it.quantity || it.qty || 1;
          const price = it.price || it.unit_price || '';
          return `• ${name} x${qty}${price ? ' — $' + price : ''}`;
        }).join('\n');
      } else {
        itemLines = '(ver detalle en app Didi)';
      }

      const msg =
        `🛵 *Nuevo pedido Didi Food*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🆔 *Pedido:* ${orderId}\n` +
        `🏪 *Tienda:* ${storeName}\n` +
        `👤 *Cliente:* ${clientName}\n` +
        `📍 *Dirección:* ${address}\n` +
        `🕐 *Hora:* ${hora} hrs\n` +
        `📋 *Estado:* ${status}\n\n` +
        `📋 *Productos:*\n${itemLines}\n\n` +
        `💰 *Total: $${total}*\n` +
        `━━━━━━━━━━━━━━`;

      await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cfg.wappToken, to: cfg.notifyPhone, body: msg })
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, received: true }, { status: 200 });
  } catch (e) {
    // Siempre respondemos 200 para que Didi no marque la URL como inválida
    return NextResponse.json({ success: true, received: true }, { status: 200 });
  }
}
