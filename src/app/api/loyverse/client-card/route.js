import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

// Busca TODOS los registros en Loyverse que coincidan con ese teléfono.
// Un cliente puede tener dos registros: uno de tienda y uno de WhatsApp.
function phoneMatches(customerPhone, phone10) {
  const stripped = (customerPhone || '').replace(/\D/g, '');
  return stripped === phone10 || stripped === '52' + phone10;
}

async function findAllCustomersByPhone(phone10, headers) {
  const matches = [];

  // ── Intento rápido con filtro nativo (a veces funciona) ──
  for (const q of [phone10, '52' + phone10]) {
    const res = await fetch(`${BASE}/customers?phone_number=${encodeURIComponent(q)}&limit=10`, { headers });
    if (!res.ok) continue;
    const data = await res.json();
    for (const c of data.customers || []) {
      if (phoneMatches(c.phone_number, phone10)) {
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
      if (phoneMatches(c.phone_number, phone10)) {
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

    // ── Cache Redis 5 min — evita escanear Loyverse en cada apertura de chat ──
    const cacheKey = `client_card_v2_${phone10}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      return NextResponse.json({ ...parsed, _cached: true });
    }

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { 'Authorization': `Bearer ${loyverseToken}` };

    // ── 1. Encontrar TODOS los registros del cliente en Loyverse ──
    const allCustomers = await findAllCustomersByPhone(phone10, headers);
    const { primary, allIds } = mergeCustomers(allCustomers);

    // ── 2. Datos de Redis ──
    const [cachedName, storedStore, promoStatus, storedAddress] = await Promise.all([
      redis.get(`client_name_${phone}`),
      redis.get(`client_store_${phone}`),
      redis.get(`promo_pos_${phone}`),
      redis.get(`client_address_${phone}`)
    ]);

    // ── 3. Dirección y tienda ──
    // Redis tiene prioridad sobre Loyverse (refleja el último guardado)
    const address = storedAddress || extractAddress(primary);
    const tienda = extractTienda(primary, storedStore);

    // ── 4. Compras: paginar recibos recientes y filtrar por customer_id ──
    // Loyverse no garantiza filtrado server-side por customer_id, así que
    // traemos los últimos 250 recibos y filtramos en nuestra lógica.
    let receipts = [];
    let storeMap = {};

    const [sRes, recRes] = await Promise.all([
      fetch(`${BASE}/stores`, { headers }),
      fetch(`${BASE}/receipts?limit=250`, { headers })
    ]);

    if (sRes.ok) {
      const sData = await sRes.json();
      for (const s of sData.stores || []) storeMap[s.id] = s.name;
    }

    if (recRes.ok && allIds.length > 0) {
      const recData = await recRes.json();
      const allReceipts = (recData.receipts || []).filter(r => allIds.includes(r.customer_id));

      // Si no encontramos nada en los últimos 250, paginar una página más
      let extraReceipts = [];
      if (allReceipts.length === 0 && recData.cursor) {
        const recRes2 = await fetch(`${BASE}/receipts?limit=250&cursor=${encodeURIComponent(recData.cursor)}`, { headers });
        if (recRes2.ok) {
          const recData2 = await recRes2.json();
          extraReceipts = (recData2.receipts || []).filter(r => allIds.includes(r.customer_id));
        }
      }

      receipts = [...allReceipts, ...extraReceipts]
        .map(r => ({
          date: r.receipt_date || r.created_at || null,
          store: storeMap[r.store_id] || 'Sucursal',
          total: r.total_money ?? 0,
          items: (r.line_items || []).length
        }))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 15);
    }

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

    const result = {
      success: true,
      client: {
        name,
        phone,
        phone10,
        points: totalPoints,
        email: primary?.email || '',
        tienda,
        address,
        _note: primary?.note || '',
        customerId: primary?.id || null,
        promoStatus,
        duplicateRecords,
        loyverseRecords: allCustomers.length
      },
      receipts,
      coupons
    };
    // Guardar en cache 5 min (no cachear si no se encontró cliente en Loyverse)
    if (primary) await redis.setex(cacheKey, 300, JSON.stringify(result));
    return NextResponse.json(result);
  } catch (e) {
    console.error('[client-card]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// Actualiza dirección o sucursal en Loyverse + Redis
export async function POST(req) {
  try {
    const { name, phone } = await req.json();
    if (!name || !phone) return NextResponse.json({ success: false, error: 'name y phone requeridos' }, { status: 400 });

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });

    const phone10 = phone.replace(/\D/g, '').slice(-10);
    const cleanPhone = '52' + phone10;

    const res = await fetch(`${BASE}/customers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), phone_number: phone10, note: 'Registrado desde Chat Web' })
    });

    const data = await res.json();
    if (!res.ok) return NextResponse.json({ success: false, error: data }, { status: res.status });

    // Cachear en Redis
    await redis.set(`client_name_${cleanPhone}`, name.trim());
    await redis.set(`client_registered_${cleanPhone}`, '1');

    return NextResponse.json({ success: true, customer: data });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const { id, name, address, note, _storeRedis, _phone } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id requerido' }, { status: 400 });

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });

    // Traer el cliente actual para no pisarle campos
    const custRes = await fetch(`https://api.loyverse.com/v1.0/customers/${id}`, {
      headers: { Authorization: `Bearer ${loyverseToken}` }
    });
    if (!custRes.ok) return NextResponse.json({ success: false, error: 'Cliente no encontrado' }, { status: 404 });
    const cust = await custRes.json();

    const payload = { id, name: name !== undefined ? name : cust.name };
    if (address !== undefined) payload.address = address;
    if (note !== undefined) payload.note = note;
    if (cust.phone_number) payload.phone_number = cust.phone_number;
    if (cust.city) payload.city = cust.city;

    const updRes = await fetch('https://api.loyverse.com/v1.0/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!updRes.ok) {
      const err = await updRes.text();
      return NextResponse.json({ success: false, error: err }, { status: 500 });
    }

    // Actualizar Redis según campo modificado + invalidar cache
    if (_phone) {
      let cleanPhone = _phone.replace(/\D/g, '');
      if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
      const phone10 = cleanPhone.slice(-10);
      if (_storeRedis !== undefined) await redis.set(`client_store_${cleanPhone}`, _storeRedis);
      if (name !== undefined) await redis.set(`client_name_${cleanPhone}`, name);
      if (address !== undefined) await redis.set(`client_address_${cleanPhone}`, address);
      await redis.del(`client_card_v2_${phone10}`);
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[client-card PATCH]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
