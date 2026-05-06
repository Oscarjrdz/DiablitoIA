import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

// Busca TODOS los registros en Loyverse que coincidan con ese teléfono.
// Un cliente puede tener dos registros: uno de tienda y uno de WhatsApp.
async function findAllCustomersByPhone(phone10, headers) {
  const matches = [];

  // ── Intento rápido con filtro nativo (a veces funciona) ──
  for (const q of [phone10, '52' + phone10]) {
    const res = await fetch(`${BASE}/customers?phone_number=${encodeURIComponent(q)}&limit=10`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    for (const c of data.customers || []) {
      if (c.phone_number?.replace(/\D/g, '').endsWith(phone10)) {
        if (!matches.find(m => m.id === c.id)) matches.push(c);
      }
    }
  }

  // ── Scan paginado completo para garantizar que no se nos escapa ninguno ──
  let cursor = null;
  do {
    let url = `${BASE}/customers?limit=250`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    for (const c of data.customers || []) {
      if (c.phone_number?.replace(/\D/g, '').endsWith(phone10)) {
        if (!matches.find(m => m.id === c.id)) matches.push(c);
      }
    }
    cursor = data.cursor || null;
  } while (cursor);

  return matches;
}

// Si hay varios registros, fusiona: elige el que tiene más puntos como principal
// y acumula los IDs de todos para buscar compras en todos.
function mergeCustomers(list) {
  if (!list.length) return { primary: null, allIds: [] };
  const sorted = [...list].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0));
  const primary = sorted[0];
  const allIds = sorted.map(c => c.id);
  return { primary, allIds };
}

// Extrae dirección del cliente (nota estructurada O campos directos de Loyverse)
function extractAddress(customer) {
  let address = '';

  // Clientes registrados en tienda (web): nota con formato Calle/Número/Colonia/Municipio
  if (customer?.note) {
    const note = customer.note;
    const parts = [
      note.match(/Calle:\s*(.+?)(?:\n|$)/)?.[1],
      note.match(/Número:\s*(.+?)(?:\n|$)/)?.[1],
      note.match(/Colonia:\s*(.+?)(?:\n|$)/)?.[1],
      note.match(/Municipio:\s*(.+?)(?:\n|$)/)?.[1],
    ].filter(v => v && v.trim());
    if (parts.length) address = parts.join(', ');
  }

  // Clientes registrados por WhatsApp: campos address + city del objeto de Loyverse
  if (!address && customer?.address) {
    address = customer.address;
    if (customer.city) address += `, ${customer.city}`;
  }

  return address.trim();
}

// Extrae tienda de la nota o del campo Redis
function extractTienda(customer, storedStore) {
  if (storedStore) return storedStore;
  if (customer?.note) {
    const m = customer.note.match(/Tienda:\s*(.+?)(?:\n|$)/);
    if (m) return m[1].trim();
  }
  return '';
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

    // ── 1. Encontrar TODOS los registros del cliente en Loyverse ──
    const allCustomers = await findAllCustomersByPhone(phone10, headers);
    const { primary, allIds } = mergeCustomers(allCustomers);

    // ── 2. Datos de Redis ──
    const [cachedName, storedStore, promoStatus] = await Promise.all([
      redis.get(`client_name_${phone}`),
      redis.get(`client_store_${phone}`),
      redis.get(`promo_pos_${phone}`)
    ]);

    // ── 3. Dirección y tienda ──
    const address = extractAddress(primary);
    const tienda = extractTienda(primary, storedStore);

    // ── 4. Compras: buscar en TODOS los registros del cliente ──
    let receipts = [];
    let storeMap = {};

    // Cargar nombres de sucursales una sola vez
    const sRes = await fetch(`${BASE}/stores`, { headers });
    if (sRes.ok) {
      const sData = await sRes.json();
      for (const s of sData.stores || []) storeMap[s.id] = s.name;
    }

    const allReceipts = [];
    for (const custId of allIds) {
      const recRes = await fetch(
        `${BASE}/receipts?customer_id=${encodeURIComponent(custId)}&limit=50&order=DESC`,
        { headers }
      );
      if (!recRes.ok) continue;
      const recData = await recRes.json();
      for (const r of recData.receipts || []) {
        // Solo incluir si pertenece a este cliente
        if (r.customer_id === custId && !allReceipts.find(x => x.receipt_number === r.receipt_number)) {
          allReceipts.push(r);
        }
      }
    }

    receipts = allReceipts
      .map(r => ({
        date: r.receipt_date || r.created_at || null,
        store: storeMap[r.store_id] || 'Sucursal',
        total: r.total_money ?? 0,
        items: (r.line_items || []).length
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 15);

    // ── 5. Cupones canjeados ──
    const allLogs = await redis.lrange('redeemed_coupons_log', 0, 500);
    const coupons = allLogs
      .map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return null; } })
      .filter(l => l && (l.phone || l.clientPhone || '').replace(/\D/g, '').endsWith(phone10))
      .sort((a, b) => new Date(b.receiptDate || 0) - new Date(a.receiptDate || 0))
      .slice(0, 20);

    // ── 6. Puntos: suma de TODOS los registros ──
    const totalPoints = allCustomers.length
      ? allCustomers.reduce((sum, c) => sum + (c.total_points ?? 0), 0)
      : null;

    const name = cachedName || primary?.name || phone10;
    const duplicateRecords = allCustomers.length > 1;

    return NextResponse.json({
      success: true,
      client: {
        name,
        phone,
        phone10,
        points: totalPoints,
        email: primary?.email || '',
        tienda,
        address,
        customerId: primary?.id || null,
        promoStatus,
        duplicateRecords,
        loyverseRecords: allCustomers.length
      },
      receipts,
      coupons
    });
  } catch (e) {
    console.error('[client-card]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
