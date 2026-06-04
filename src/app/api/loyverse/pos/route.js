import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

export async function GET(req) {
  try {
    // ── Cache Redis 30 min — evita 7+ llamadas a Loyverse por apertura de chat ──
    const { searchParams } = req ? new URL(req.url) : { searchParams: new URLSearchParams() };
    const bust = searchParams.get('bust');
    if (!bust) {
      const cached = await redis.get('pos_cache_v2');
      if (cached) {
        const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
        return NextResponse.json({ ...parsed, _cached: true });
      }
    }

    const token = await redis.get('loyverse_token');
    if (!token) return NextResponse.json({ success: false, error: 'No Loyverse token' }, { status: 500 });
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch items with pagination (up to 1000)
    let allItems = [];
    let cursor = null;
    let page = 0;
    do {
      const url = cursor
        ? `${BASE}/items?limit=250&cursor=${encodeURIComponent(cursor)}`
        : `${BASE}/items?limit=250`;
      const r = await fetch(url, { headers });
      if (!r.ok) break;
      const d = await r.json();
      allItems = allItems.concat(d.items || []);
      cursor = d.cursor || null;
      page++;
    } while (cursor && page < 4);

    const [storesRes, payTypesRes, modifiersRes] = await Promise.all([
      fetch(`${BASE}/stores`, { headers }),
      fetch(`${BASE}/payment_types`, { headers }),
      fetch(`${BASE}/modifiers`, { headers })
    ]);

    const storesData = storesRes.ok ? await storesRes.json() : {};
    const payTypesData = payTypesRes.ok ? await payTypesRes.json() : {};
    const modifiersData = modifiersRes.ok ? await modifiersRes.json() : {};

    const result = {
      success: true,
      items: allItems
        .filter(i => !i.deleted_at && i.variants?.length > 0)
        .sort((a, b) => a.item_name.localeCompare(b.item_name, 'es')), // pre-ordenado
      stores: storesData.stores || [],
      paymentTypes: payTypesData.payment_types || [],
      modifiers: modifiersData.modifiers || []
    };
    await redis.setex('pos_cache_v2', 43200, JSON.stringify(result)); // 12 horas
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { store_id, line_items, payment_type_id, total, customer_id } = await req.json();
    if (!store_id || !line_items?.length) {
      return NextResponse.json({ success: false, error: 'Faltan campos requeridos' }, { status: 400 });
    }

    const token = await redis.get('loyverse_token');
    if (!token) return NextResponse.json({ success: false, error: 'No Loyverse token' }, { status: 500 });
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    let payTypeId = payment_type_id;
    if (!payTypeId) {
      const ptRes = await fetch(`${BASE}/payment_types`, { headers: { Authorization: `Bearer ${token}` } });
      if (ptRes.ok) {
        const ptData = await ptRes.json();
        payTypeId = ptData.payment_types?.[0]?.id;
      }
    }

    const receipt = {
      store_id,
      ...(customer_id ? { customer_id } : {}),
      receipt_date: new Date().toISOString(),
      line_items: line_items.map(item => ({
        item_id: item.item_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        price: item.price,
        total_money: +(item.price * item.quantity).toFixed(2),
        gross_total_money: +(item.price * item.quantity).toFixed(2)
      })),
      payments: payTypeId ? [{ payment_type_id: payTypeId, money_amount: +total.toFixed(2) }] : []
    };

    const res = await fetch(`${BASE}/receipts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(receipt)
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data }, { status: res.status });
    return NextResponse.json({ success: true, receipt: data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
