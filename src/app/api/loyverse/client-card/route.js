import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

// Busca el cliente en Loyverse por los últimos 10 dígitos del teléfono.
// Primero prueba el filtro rápido de la API; si no hay match verificado,
// hace un scan paginado completo (igual que el endpoint de reset).
async function findCustomerByPhone(phone10, headers) {
  const tryMatch = (list) =>
    list.find(c => c.phone_number && c.phone_number.replace(/\D/g, '').endsWith(phone10));

  // ── Intento rápido: filtro nativo de Loyverse ──
  for (const q of [phone10, '52' + phone10]) {
    const res = await fetch(`${BASE}/customers?phone_number=${encodeURIComponent(q)}&limit=10`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    const match = tryMatch(data.customers || []);
    if (match) return match;
  }

  // ── Fallback: scan paginado completo ──
  let cursor = null;
  do {
    let url = `${BASE}/customers?limit=250`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    const match = tryMatch(data.customers || []);
    if (match) return match;
    cursor = data.cursor || null;
  } while (cursor);

  return null;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    let phone = (searchParams.get('phone') || '').replace(/\D/g, '');
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' }, { status: 400 });

    if (!phone.startsWith('52')) phone = '52' + phone;
    const phone10 = phone.slice(-10);

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { 'Authorization': `Bearer ${loyverseToken}` };

    // ── 1. Encontrar cliente correcto en Loyverse ──
    const customer = await findCustomerByPhone(phone10, headers);

    // ── 2. Datos de Redis (caché) ──
    const [cachedName, storedStore, promoStatus] = await Promise.all([
      redis.get(`client_name_${phone}`),
      redis.get(`client_store_${phone}`),
      redis.get(`promo_pos_${phone}`)
    ]);

    // ── 3. Dirección y tienda desde nota de Loyverse ──
    let tienda = storedStore || '';
    let address = '';
    if (customer?.note) {
      const note = customer.note;
      const tiendaM = note.match(/Tienda:\s*(.+?)(?:\n|$)/);
      if (tiendaM) tienda = tiendaM[1].trim();
      const parts = [
        note.match(/Calle:\s*(.+?)(?:\n|$)/)?.[1],
        note.match(/Número:\s*(.+?)(?:\n|$)/)?.[1],
        note.match(/Colonia:\s*(.+?)(?:\n|$)/)?.[1],
        note.match(/Municipio:\s*(.+?)(?:\n|$)/)?.[1],
      ].filter(Boolean);
      address = parts.join(', ');
    }

    // ── 4. Compras del cliente (filtradas por su customer_id) ──
    let receipts = [];
    if (customer?.id) {
      // El filtro customer_id es soportado por Loyverse v1.0
      const recRes = await fetch(
        `${BASE}/receipts?customer_id=${encodeURIComponent(customer.id)}&limit=50&order=DESC`,
        { headers }
      );
      if (recRes.ok) {
        const recData = await recRes.json();
        const rawReceipts = (recData.receipts || [])
          // Doble verificación: solo compras de este cliente
          .filter(r => r.customer_id === customer.id);

        // Obtener nombres de sucursales
        const storeIds = [...new Set(rawReceipts.map(r => r.store_id).filter(Boolean))];
        let storeMap = {};
        if (storeIds.length) {
          const sRes = await fetch(`${BASE}/stores`, { headers });
          if (sRes.ok) {
            const sData = await sRes.json();
            for (const s of sData.stores || []) storeMap[s.id] = s.name;
          }
        }

        receipts = rawReceipts
          .map(r => ({
            date: r.receipt_date || r.created_at || null,
            store: storeMap[r.store_id] || 'Sucursal',
            total: r.total_money ?? 0,
            items: (r.line_items || []).length
          }))
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, 15);
      }
    }

    // ── 5. Cupones canjeados (log en Redis filtrado por teléfono) ──
    const allLogs = await redis.lrange('redeemed_coupons_log', 0, 500);
    const coupons = allLogs
      .map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return null; } })
      .filter(l => l && (l.phone || l.clientPhone || '').replace(/\D/g, '').endsWith(phone10))
      .sort((a, b) => new Date(b.receiptDate || 0) - new Date(a.receiptDate || 0))
      .slice(0, 20);

    // ── 6. Puntos: del objeto customer de Loyverse (fuente de verdad) ──
    const points = customer?.total_points ?? null;
    const name = cachedName || customer?.name || phone10;

    return NextResponse.json({
      success: true,
      client: {
        name,
        phone,
        phone10,
        points,
        email: customer?.email || '',
        tienda,
        address,
        customerId: customer?.id || null,
        promoStatus
      },
      receipts,
      coupons
    });
  } catch (e) {
    console.error('[client-card]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
