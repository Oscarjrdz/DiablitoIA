import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { createHmac } from 'crypto';

// Verifica firma HMAC-SHA256 del header Signature-Webhook
function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature) return true; // si no hay secret configurado, se acepta
  try {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return expected === signature;
  } catch {
    return false;
  }
}

// GET → verificación de URL al registrarla en el portal Didi
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('challenge') || searchParams.get('token') || searchParams.get('verify_token');
  await redis.setex('didi_verify_request', 86400, JSON.stringify({
    ts: Date.now(),
    params: Object.fromEntries(searchParams.entries())
  }));
  if (challenge) return new Response(challenge, { status: 200 });
  return new Response('OK', { status: 200 });
}

// POST → pedido nuevo desde Didi Food
export async function POST(req) {
  const rawBody = await req.text();
  const ts = Date.now();

  try {
    // Verificar firma si hay secret configurado
    const configStr = await redis.get('didi_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    const signature = req.headers.get('Signature-Webhook') || req.headers.get('signature-webhook') || '';

    if (cfg.webhookSecret && !verifySignature(rawBody, signature, cfg.webhookSecret)) {
      await redis.setex(`didi_sig_error_${ts}`, 86400, JSON.stringify({ ts, signature, rawBody }));
      return NextResponse.json({ success: false, error: 'invalid signature' }, { status: 401 });
    }

    // Guardamos raw en Redis
    await redis.setex(`didi_order_raw_${ts}`, 86400 * 7, rawBody);
    await redis.lpush('didi_orders_log', JSON.stringify({ ts, raw: rawBody }));
    await redis.ltrim('didi_orders_log', 0, 49);

    let body = {};
    try { body = JSON.parse(rawBody); } catch {}

    // Campos del payload Didi Food (total en centavos)
    const orderId     = body?.external_id   || '—';
    const orderNumber = body?.order_number   || '—';
    const storeId     = body?.external_store_id || '—';
    const clientName  = body?.customer       || '—';
    const totalCents  = body?.total          || 0;
    const total       = (totalCents / 100).toFixed(2);
    const discount    = ((body?.discount_value || 0) / 100).toFixed(2);
    const instructions = body?.instructions  || '';
    const deliveryId  = body?.delivery_id    || null;
    const items       = body?.items          || [];
    const createdAt   = body?.created_at     || new Date().toISOString();

    // Guardamos el pedido parseado en Redis para la UI
    const orderData = { ts, orderId, orderNumber, storeId, clientName, total, discount, instructions, deliveryId, items, createdAt, status: 'new' };
    await redis.setex(`didi_order_${orderId}`, 86400 * 7, JSON.stringify(orderData));
    await redis.lpush('didi_pending_orders', JSON.stringify(orderData));
    await redis.ltrim('didi_pending_orders', 0, 99);

    // Notificación WhatsApp
    const wappStr = await redis.get('wapp_config');
    const wapp = typeof wappStr === 'string' ? JSON.parse(wappStr) : (wappStr || {});

    if (wapp.wappInstance && wapp.wappToken && wapp.notifyPhone) {
      const hora = new Date(createdAt).toLocaleTimeString('es-MX', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey'
      });

      const itemLines = items.length > 0
        ? items.map(it => {
            const mods = (it.modifiers || []).map(m => `   + ${m.name} x${m.quantity}`).join('\n');
            const lineTotal = ((it.total_value || 0) / 100).toFixed(2);
            return `• ${it.name} x${it.quantity} — $${lineTotal}${mods ? '\n' + mods : ''}`;
          }).join('\n')
        : '(sin detalle)';

      const msg =
        `🛵 *Nuevo pedido Didi Food*\n` +
        `━━━━━━━━━━━━━━\n` +
        `🆔 *Pedido:* ${orderNumber}\n` +
        `🏪 *Tienda ID:* ${storeId}\n` +
        `👤 *Cliente:* ${clientName}\n` +
        `🕐 *Hora:* ${hora} hrs\n` +
        (instructions ? `📝 *Notas:* ${instructions}\n` : '') +
        `\n📋 *Productos:*\n${itemLines}\n\n` +
        (discount !== '0.00' ? `🏷️ *Descuento:* -$${discount}\n` : '') +
        `💰 *Total: $${total} MXN*\n` +
        `━━━━━━━━━━━━━━\n` +
        `_ID: ${orderId}_`;

      await fetch(
        `https://gatewaywapp-production.up.railway.app/${wapp.wappInstance}/messages/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: wapp.wappToken, to: wapp.notifyPhone, body: msg })
        }
      ).catch(() => {});
    }

    // Didi espera 200 con cuerpo vacío o mínimo
    return new Response(null, { status: 200 });
  } catch (e) {
    await redis.setex(`didi_error_${ts}`, 86400, JSON.stringify({ ts, error: e.message, raw: rawBody }));
    // Siempre 200 para que Didi no reintente
    return new Response(null, { status: 200 });
  }
}
