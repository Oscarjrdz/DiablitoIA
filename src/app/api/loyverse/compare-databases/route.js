import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { saveContactToDevice } from '@/lib/contacts';

const BASE = 'https://api.loyverse.com/v1.0';

// Descarga TODOS los clientes de Loyverse (paginado) → mapa phone10 → mejor registro (más puntos)
async function loadLoyverseByPhone(headers) {
  let customers = [];
  let cursor = null;
  let page = 0;
  do {
    const url = cursor
      ? `${BASE}/customers?limit=250&cursor=${encodeURIComponent(cursor)}`
      : `${BASE}/customers?limit=250`;
    const res = await fetch(url, { headers });
    if (!res.ok) break;
    const data = await res.json();
    customers = customers.concat(data.customers || []);
    cursor = data.cursor || null;
    page++;
  } while (cursor && page < 40);

  const byPhone = {};
  for (const c of customers) {
    if (!c.phone_number) continue;
    const phone10 = c.phone_number.replace(/\D/g, '').slice(-10);
    if (phone10.length < 10) continue;
    if (!byPhone[phone10] || (c.total_points || 0) > (byPhone[phone10].total_points || 0)) {
      byPhone[phone10] = c;
    }
  }
  return { customers, byPhone };
}

// Crea un cliente en Loyverse a partir de datos de Redis.
// Se guarda en la sucursal "WhatsApp" (igual que el registro del bot) y se refleja en client_store_*
async function createLoyverseCustomer(headers, { name, phone10, address }) {
  const payload = {
    name: (name && String(name).trim()) || phone10,
    phone_number: phone10,
    note: 'Tienda: WhatsApp\nRegistrado via conciliación de bases (bot)'
  };
  if (address && String(address).trim()) payload.address = String(address).trim();
  const res = await fetch(`${BASE}/customers`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Loyverse: ' + (await res.text()).slice(0, 200));
  await redis.set(`client_store_52${phone10}`, 'WhatsApp');
  // Guardar también en el aparato (+ record contact_saved_*)
  saveContactToDevice({ phone: phone10, fullName: payload.name })
    .catch(e => console.error('[compare-databases] Error guardando contacto WA:', e.message));
  return res.json();
}

// GET → compara clientes de Loyverse vs keys client_name_* en Redis
export async function GET() {
  try {
    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { Authorization: `Bearer ${loyverseToken}` };

    // ── 1. Loyverse ──
    const { customers: loyverseCustomers, byPhone: loyverseByPhone } = await loadLoyverseByPhone(headers);

    // ── 2. Obtener todos los client_name_52* de Redis ──
    const redisKeys = await redis.keys('client_name_52*');
    const redisByPhone = {};

    if (redisKeys.length > 0) {
      const values = await redis.mget(...redisKeys);
      for (let i = 0; i < redisKeys.length; i++) {
        const phone52 = redisKeys[i].replace('client_name_', '');
        const phone10 = phone52.slice(-10);
        if (phone10.length < 10) continue;
        redisByPhone[phone10] = {
          key: redisKeys[i],
          phone52,
          phone10,
          name: values[i] != null ? String(values[i]) : null
        };
      }
    }

    // ── 3. Cruzar ──
    const allPhones = new Set([...Object.keys(loyverseByPhone), ...Object.keys(redisByPhone)]);

    const onlyLoyverse = [];
    const onlyRedis    = [];
    const nameMismatch = [];
    let   synced       = 0;

    for (const phone10 of allPhones) {
      const loy = loyverseByPhone[phone10];
      const red = redisByPhone[phone10];

      if (loy && !red) {
        onlyLoyverse.push({
          phone10,
          name: loy.name || '',
          loyverseId: loy.id,
          points: loy.total_points || 0
        });
      } else if (!loy && red) {
        onlyRedis.push({
          phone10,
          phone52: red.phone52,
          key: red.key,
          name: red.name || ''
        });
      } else if (loy && red) {
        const loyName = (loy.name || '').trim().toLowerCase();
        const redName = (red.name || '').trim().toLowerCase();
        if (loyName && redName && loyName !== redName) {
          nameMismatch.push({
            phone10,
            phone52: red.phone52,
            key: red.key,
            loyverseName: loy.name,
            redisName: red.name,
            loyverseId: loy.id,
            points: loy.total_points || 0
          });
        } else {
          synced++;
        }
      }
    }

    // Adjuntar la dirección guardada en Redis a los "Solo en Redis" (para crearlos en Loyverse)
    if (onlyRedis.length > 0) {
      const addrKeys = onlyRedis.map(x => `client_address_${x.phone52}`);
      const addrVals = await redis.mget(...addrKeys);
      onlyRedis.forEach((x, i) => { x.address = addrVals[i] != null ? String(addrVals[i]) : ''; });
    }

    // Ordenar: mismatch por nombre, onlyRedis/Loyverse por phone
    nameMismatch.sort((a, b) => a.loyverseName.localeCompare(b.loyverseName, 'es'));
    onlyRedis.sort((a, b) => a.phone10.localeCompare(b.phone10));
    onlyLoyverse.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return NextResponse.json({
      success: true,
      stats: {
        loyverseTotal: loyverseCustomers.length,
        redisTotal: Object.keys(redisByPhone).length,
        synced,
        onlyLoyverse: onlyLoyverse.length,
        onlyRedis: onlyRedis.length,
        nameMismatch: nameMismatch.length
      },
      onlyLoyverse,
      onlyRedis,
      nameMismatch
    });
  } catch (e) {
    console.error('[compare-databases]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// PATCH → acciones correctivas individuales
export async function PATCH(req) {
  try {
    const { action, key, newName, phone10, name } = await req.json();

    if (action === 'sync-name' && key && newName) {
      await redis.set(key, newName.trim());
      return NextResponse.json({ success: true });
    }

    if (action === 'clean-redis' && key) {
      await redis.del(key);
      return NextResponse.json({ success: true });
    }

    // Promover un "Solo en Loyverse" → crear su llave de nombre en Redis
    if (action === 'create-redis' && phone10 && name) {
      await redis.set(`client_name_52${phone10}`, String(name).trim());
      return NextResponse.json({ success: true });
    }

    // Promover un "Solo en Redis" → crear el cliente en Loyverse
    if (action === 'create-loyverse' && phone10) {
      const loyverseToken = await redis.get('loyverse_token');
      if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
      const headers = { Authorization: `Bearer ${loyverseToken}` };
      let address = '';
      const a = await redis.get(`client_address_52${phone10}`);
      if (a) address = String(a);
      await createLoyverseCustomer(headers, { name, phone10, address });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Acción inválida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST → sincronización masiva
//   { syncAll: true }     → actualiza nombres en Redis para que coincidan con Loyverse
//   { reconcileAll: true } → iguala ambas bases SIN borrar: crea lo que falte de cada lado
export async function POST(req) {
  try {
    const { syncAll, reconcileAll } = await req.json();

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { Authorization: `Bearer ${loyverseToken}` };

    const { byPhone: loyverseByPhone } = await loadLoyverseByPhone(headers);

    // Leer nombres de Redis
    const redisKeys = await redis.keys('client_name_52*');
    const redisByPhone = {};
    if (redisKeys.length > 0) {
      const vals = await redis.mget(...redisKeys);
      for (let i = 0; i < redisKeys.length; i++) {
        const phone52 = redisKeys[i].replace('client_name_', '');
        const phone10 = phone52.slice(-10);
        if (phone10.length < 10) continue;
        redisByPhone[phone10] = { key: redisKeys[i], phone52, phone10, name: vals[i] != null ? String(vals[i]) : null };
      }
    }

    // ── Sincronización de nombres (comportamiento previo) ──
    if (syncAll) {
      let fixed = 0;
      for (const phone10 of Object.keys(redisByPhone)) {
        const loy = loyverseByPhone[phone10];
        if (!loy || !loy.name) continue;
        const redName = (redisByPhone[phone10].name || '').trim().toLowerCase();
        const loyName = loy.name.trim().toLowerCase();
        if (loyName && redName !== loyName) {
          await redis.set(redisByPhone[phone10].key, loy.name.trim());
          fixed++;
        }
      }
      return NextResponse.json({ success: true, fixed });
    }

    // ── Reconciliación completa: igualar ambas bases sin borrar ──
    if (reconcileAll) {
      const allPhones = new Set([...Object.keys(loyverseByPhone), ...Object.keys(redisByPhone)]);
      let createdRedis = 0;      // Loyverse → Redis
      let createdLoyverse = 0;   // Redis → Loyverse
      const errors = [];

      // Direcciones de los que están solo en Redis
      const onlyRedisPhones = [...allPhones].filter(p => !loyverseByPhone[p] && redisByPhone[p]);
      let addrMap = {};
      if (onlyRedisPhones.length > 0) {
        const addrKeys = onlyRedisPhones.map(p => `client_address_52${p}`);
        const addrVals = await redis.mget(...addrKeys);
        onlyRedisPhones.forEach((p, i) => { addrMap[p] = addrVals[i] != null ? String(addrVals[i]) : ''; });
      }

      for (const phone10 of allPhones) {
        const loy = loyverseByPhone[phone10];
        const red = redisByPhone[phone10];

        if (loy && !red) {
          // Solo en Loyverse → crear llave de nombre en Redis
          try {
            await redis.set(`client_name_52${phone10}`, (loy.name || phone10).trim());
            createdRedis++;
          } catch (e) { errors.push({ phone10, side: 'redis', error: e.message }); }
        } else if (!loy && red) {
          // Solo en Redis → crear cliente en Loyverse
          try {
            await createLoyverseCustomer(headers, { name: red.name, phone10, address: addrMap[phone10] });
            createdLoyverse++;
          } catch (e) { errors.push({ phone10, side: 'loyverse', error: e.message }); }
        }
      }

      return NextResponse.json({ success: true, createdRedis, createdLoyverse, errors });
    }

    return NextResponse.json({ success: false, error: 'syncAll o reconcileAll requerido' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
