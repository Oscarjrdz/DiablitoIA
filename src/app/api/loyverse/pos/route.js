import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

export async function GET() {
  try {
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

    const [storesRes, payTypesRes] = await Promise.all([
      fetch(`${BASE}/stores`, { headers }),
      fetch(`${BASE}/payment_types`, { headers })
    ]);

    const storesData = storesRes.ok ? await storesRes.json() : {};
    const payTypesData = payTypesRes.ok ? await payTypesRes.json() : {};

    return NextResponse.json({
      success: true,
      items: allItems.filter(i => !i.deleted_at && i.variants?.length > 0),
      stores: storesData.stores || [],
      paymentTypes: payTypesData.payment_types || []
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { store_id, line_items, payment_type_id, total } = await req.json();
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
