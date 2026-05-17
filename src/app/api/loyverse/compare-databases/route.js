import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

// GET → compara clientes de Loyverse vs keys client_name_* en Redis
export async function GET() {
  try {
    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { Authorization: `Bearer ${loyverseToken}` };

    // ── 1. Descargar TODOS los clientes de Loyverse ──
    let loyverseCustomers = [];
    let cursor = null;
    let page = 0;
    do {
      const url = cursor
        ? `${BASE}/customers?limit=250&cursor=${encodeURIComponent(cursor)}`
        : `${BASE}/customers?limit=250`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const data = await res.json();
      loyverseCustomers = loyverseCustomers.concat(data.customers || []);
      cursor = data.cursor || null;
      page++;
    } while (cursor && page < 40);

    // Mapa Loyverse: phone10 → mejor registro (más puntos)
    const loyverseByPhone = {};
    for (const c of loyverseCustomers) {
      if (!c.phone_number) continue;
      const phone10 = c.phone_number.replace(/\D/g, '').slice(-10);
      if (phone10.length < 10) continue;
      if (!loyverseByPhone[phone10]) {
        loyverseByPhone[phone10] = c;
      } else if ((c.total_points || 0) > (loyverseByPhone[phone10].total_points || 0)) {
        loyverseByPhone[phone10] = c;
      }
    }

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
    const { action, key, newName } = await req.json();

    if (action === 'sync-name' && key && newName) {
      await redis.set(key, newName.trim());
      return NextResponse.json({ success: true });
    }

    if (action === 'clean-redis' && key) {
      await redis.del(key);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Acción inválida' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// POST → sincronización masiva: actualiza Redis para que coincida con Loyverse
export async function POST(req) {
  try {
    const { syncAll } = await req.json();
    if (!syncAll) return NextResponse.json({ success: false, error: 'syncAll requerido' }, { status: 400 });

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { Authorization: `Bearer ${loyverseToken}` };

    // Descargar Loyverse
    let loyverseCustomers = [];
    let cursor = null;
    let page = 0;
    do {
      const url = cursor
        ? `https://api.loyverse.com/v1.0/customers?limit=250&cursor=${encodeURIComponent(cursor)}`
        : `https://api.loyverse.com/v1.0/customers?limit=250`;
      const res = await fetch(url, { headers });
      if (!res.ok) break;
      const data = await res.json();
      loyverseCustomers = loyverseCustomers.concat(data.customers || []);
      cursor = data.cursor || null;
      page++;
    } while (cursor && page < 40);

    const loyverseByPhone = {};
    for (const c of loyverseCustomers) {
      if (!c.phone_number || !c.name) continue;
      const phone10 = c.phone_number.replace(/\D/g, '').slice(-10);
      if (phone10.length < 10) continue;
      if (!loyverseByPhone[phone10] || (c.total_points || 0) > (loyverseByPhone[phone10].total_points || 0)) {
        loyverseByPhone[phone10] = c;
      }
    }

    // Leer Redis
    const redisKeys = await redis.keys('client_name_52*');
    let fixed = 0;
    for (const key of redisKeys) {
      const phone10 = key.replace('client_name_52', '');
      const loy = loyverseByPhone[phone10];
      if (!loy) continue;
      const redVal = await redis.get(key);
      const redName = redVal != null ? String(redVal).trim().toLowerCase() : '';
      const loyName = (loy.name || '').trim().toLowerCase();
      if (loyName && redName !== loyName) {
        await redis.set(key, loy.name.trim());
        fixed++;
      }
    }

    return NextResponse.json({ success: true, fixed });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
