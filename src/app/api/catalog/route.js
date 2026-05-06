import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const GW = 'https://gatewaywapp-production.up.railway.app';

async function getCfg() {
  const s = await redis.get('wapp_config');
  return typeof s === 'string' ? JSON.parse(s) : (s || {});
}

// ── GET — Listar catálogo (o producto por ID con ?productId=) ──
export async function GET(req) {
  try {
    const cfg = await getCfg();
    if (!cfg.wappInstance || !cfg.wappToken)
      return NextResponse.json({ success: false, error: 'Sin configuración de WhatsApp' });

    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    // GET single product by ID
    if (productId) {
      const res = await fetch(
        `${GW}/${cfg.wappInstance}/catalog/${productId}?token=${cfg.wappToken}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (!res.ok) return NextResponse.json({ success: false, error: data?.message || 'Error', raw: data });
      return NextResponse.json({ success: true, product: data.product || data });
    }

    // GET full catalog with pagination
    const limit = searchParams.get('limit') || '100';
    const cursor = searchParams.get('cursor') || '';
    let url = `${GW}/${cfg.wappInstance}/catalog?token=${cfg.wappToken}&limit=${limit}`;
    if (cursor) url += `&cursor=${cursor}`;

    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data?.message || 'Error', raw: data });

    return NextResponse.json({
      success: true,
      products: data.products || [],
      count: data.count || 0,
      nextPageCursor: data.nextPageCursor || null,
    });
  } catch (e) {
    console.error('Catalog GET error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}

// ── POST — Crear producto ──
export async function POST(req) {
  try {
    const cfg = await getCfg();
    if (!cfg.wappInstance || !cfg.wappToken)
      return NextResponse.json({ success: false, error: 'Sin configuración de WhatsApp' });

    const body = await req.json();
    const payload = {
      token: cfg.wappToken,
      name: body.name,
      description: body.description || '',
      price: body.price != null ? Math.round(Number(body.price)) : 0,
      currency: body.currency || 'MXN',
    };
    if (body.images) payload.images = body.images;
    if (body.retailerId) payload.retailerId = body.retailerId;
    if (body.isHidden != null) payload.isHidden = body.isHidden;

    const res = await fetch(`${GW}/${cfg.wappInstance}/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data?.message || 'Error al crear', raw: data });

    return NextResponse.json({ success: true, product: data.product || data });
  } catch (e) {
    console.error('Catalog POST error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}

// ── PATCH — Actualizar producto existente ──
export async function PATCH(req) {
  try {
    const cfg = await getCfg();
    if (!cfg.wappInstance || !cfg.wappToken)
      return NextResponse.json({ success: false, error: 'Sin configuración de WhatsApp' });

    const body = await req.json();
    const { productId, ...fields } = body;
    if (!productId) return NextResponse.json({ success: false, error: 'productId requerido' });

    const payload = { token: cfg.wappToken };
    if (fields.name != null) payload.name = fields.name;
    if (fields.description != null) payload.description = fields.description;
    if (fields.price != null) payload.price = Math.round(Number(fields.price));
    if (fields.images) payload.images = fields.images;
    if (fields.isHidden != null) payload.isHidden = fields.isHidden;
    if (fields.retailerId != null) payload.retailerId = fields.retailerId;

    const res = await fetch(`${GW}/${cfg.wappInstance}/catalog/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data?.message || 'Error al actualizar', raw: data });

    return NextResponse.json({ success: true, product: data.product || data });
  } catch (e) {
    console.error('Catalog PATCH error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}

// ── DELETE — Eliminar productos por IDs ──
export async function DELETE(req) {
  try {
    const cfg = await getCfg();
    if (!cfg.wappInstance || !cfg.wappToken)
      return NextResponse.json({ success: false, error: 'Sin configuración de WhatsApp' });

    const body = await req.json();
    const res = await fetch(`${GW}/${cfg.wappInstance}/catalog`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cfg.wappToken, productIds: body.productIds || [] })
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data?.message || 'Error al eliminar', raw: data });

    return NextResponse.json({ success: true, deleted: data.deleted || 0 });
  } catch (e) {
    console.error('Catalog DELETE error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}
