import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { randomUUID } from 'crypto';

const CATALOG_KEY = 'catalog_products';

async function getAll() {
  const raw = await redis.get(CATALOG_KEY);
  if (!raw) return [];
  return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []);
}

async function saveAll(products) {
  await redis.set(CATALOG_KEY, JSON.stringify(products));
}

// ── GET — Listar catálogo (o producto por ID con ?productId=) ──
export async function GET(req) {
  try {
    const products = await getAll();
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');

    if (productId) {
      const product = products.find(p => p.id === productId);
      if (!product) return NextResponse.json({ success: false, error: 'Producto no encontrado' });
      return NextResponse.json({ success: true, product });
    }

    return NextResponse.json({
      success: true,
      products,
      count: products.length,
      nextPageCursor: null,
    });
  } catch (e) {
    console.error('Catalog GET error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}

// ── POST — Crear producto ──
export async function POST(req) {
  try {
    const body = await req.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ success: false, error: 'El nombre es requerido' });
    }

    const products = await getAll();

    const newProduct = {
      id: randomUUID(),
      name: body.name.trim(),
      description: body.description?.trim() || '',
      price: body.price != null ? Math.round(Number(body.price)) : 0,
      currencyCode: body.currency || 'MXN',
      retailerId: body.retailerId?.trim() || '',
      images: (body.images || []).map(url => (typeof url === 'string' ? { url } : url)),
      isHidden: body.isHidden || false,
      createdAt: new Date().toISOString(),
    };

    products.push(newProduct);
    await saveAll(products);

    return NextResponse.json({ success: true, product: newProduct });
  } catch (e) {
    console.error('Catalog POST error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}

// ── PATCH — Actualizar producto existente ──
export async function PATCH(req) {
  try {
    const body = await req.json();
    const { productId, ...fields } = body;
    if (!productId) return NextResponse.json({ success: false, error: 'productId requerido' });

    const products = await getAll();
    const idx = products.findIndex(p => p.id === productId);
    if (idx === -1) return NextResponse.json({ success: false, error: 'Producto no encontrado' });

    const product = products[idx];
    if (fields.name != null) product.name = fields.name.trim();
    if (fields.description != null) product.description = fields.description.trim();
    if (fields.price != null) product.price = Math.round(Number(fields.price));
    if (fields.images) product.images = fields.images.map(url => (typeof url === 'string' ? { url } : url));
    if (fields.isHidden != null) product.isHidden = fields.isHidden;
    if (fields.retailerId != null) product.retailerId = fields.retailerId.trim();
    product.updatedAt = new Date().toISOString();

    products[idx] = product;
    await saveAll(products);

    return NextResponse.json({ success: true, product });
  } catch (e) {
    console.error('Catalog PATCH error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}

// ── DELETE — Eliminar productos por IDs ──
export async function DELETE(req) {
  try {
    const body = await req.json();
    const idsToDelete = body.productIds || [];
    if (idsToDelete.length === 0) return NextResponse.json({ success: false, error: 'productIds requerido' });

    const products = await getAll();
    const filtered = products.filter(p => !idsToDelete.includes(p.id));
    const deleted = products.length - filtered.length;

    await saveAll(filtered);

    return NextResponse.json({ success: true, deleted });
  } catch (e) {
    console.error('Catalog DELETE error:', e);
    return NextResponse.json({ success: false, error: e.message });
  }
}
