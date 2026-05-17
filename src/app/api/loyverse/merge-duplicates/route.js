import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

async function getToken() {
  const token = await redis.get('loyverse_token');
  if (!token) throw new Error('No Loyverse token');
  return token;
}

// GET → detectar todos los duplicados (mismo teléfono)
export async function GET() {
  try {
    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}` };

    // Paginar todos los clientes
    let allCustomers = [];
    let cursor = null;
    let page = 0;
    do {
      const url = cursor
        ? `${BASE}/customers?limit=250&cursor=${encodeURIComponent(cursor)}`
        : `${BASE}/customers?limit=250`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const data = await res.json();
      allCustomers = allCustomers.concat(data.customers || []);
      cursor = data.cursor || null;
      page++;
    } while (cursor && page < 20);

    // Agrupar por teléfono normalizado
    const byPhone = {};
    for (const c of allCustomers) {
      if (!c.phone_number) continue;
      const norm = c.phone_number.replace(/\D/g, '').slice(-10);
      if (!norm || norm.length < 10) continue;
      if (!byPhone[norm]) byPhone[norm] = [];
      byPhone[norm].push(c);
    }

    // Solo grupos con más de uno
    const duplicates = Object.entries(byPhone)
      .filter(([, group]) => group.length > 1)
      .map(([phone, group]) => ({
        phone,
        count: group.length,
        customers: group.map(c => ({
          id: c.id,
          name: c.name,
          phone_number: c.phone_number,
          email: c.email || '',
          total_points: c.total_points || 0,
          address: c.address || '',
          note: c.note || '',
          created_at: c.created_at
        }))
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ success: true, duplicates, total: allCustomers.length, duplicateGroups: duplicates.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST → fusionar un grupo: keepId = ID a conservar, deleteIds = IDs a eliminar
export async function POST(req) {
  try {
    const { keepId, deleteIds } = await req.json();
    if (!keepId || !deleteIds?.length) {
      return NextResponse.json({ success: false, error: 'keepId y deleteIds requeridos' }, { status: 400 });
    }

    const token = await getToken();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // Obtener datos de todos los que se van a eliminar para sumar puntos
    let extraPoints = 0;
    for (const id of deleteIds) {
      const res = await fetch(`${BASE}/customers/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        extraPoints += data.total_points || 0;
      }
    }

    // Si hay puntos extra, actualizamos el cliente principal sumándolos
    if (extraPoints > 0) {
      const keepRes = await fetch(`${BASE}/customers/${keepId}`, { headers });
      if (keepRes.ok) {
        const keepData = await keepRes.json();
        const newPoints = (keepData.total_points || 0) + extraPoints;
        await fetch(`${BASE}/customers`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: keepId, total_points: newPoints })
        });
      }
    }

    // Eliminar los duplicados
    const results = [];
    for (const id of deleteIds) {
      const res = await fetch(`${BASE}/customers/${id}`, { method: 'DELETE', headers });
      results.push({ id, deleted: res.ok, status: res.status });
    }

    return NextResponse.json({ success: true, pointsTransferred: extraPoints, results });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
