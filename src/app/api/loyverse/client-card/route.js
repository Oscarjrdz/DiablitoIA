import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const BASE = 'https://api.loyverse.com/v1.0';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    let phone = (searchParams.get('phone') || '').replace(/\D/g, '');
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' }, { status: 400 });

    // Normalize to 52XXXXXXXXXX
    if (!phone.startsWith('52')) phone = '52' + phone;
    const phone10 = phone.slice(-10);

    const loyverseToken = await redis.get('loyverse_token');
    if (!loyverseToken) return NextResponse.json({ success: false, error: 'No token' }, { status: 500 });
    const headers = { 'Authorization': `Bearer ${loyverseToken}` };

    // ── 1. Buscar cliente en Loyverse por teléfono ──
    const custRes = await fetch(`${BASE}/customers?phone_number=${encodeURIComponent(phone10)}&limit=5`, { headers });
    const custData = custRes.ok ? await custRes.json() : {};
    let customer = (custData.customers || [])[0] || null;

    // Si no encontró con 10 dígitos, intenta con el número completo 52...
    if (!customer) {
      const custRes2 = await fetch(`${BASE}/customers?phone_number=${encodeURIComponent(phone)}&limit=5`, { headers });
      const custData2 = custRes2.ok ? await custRes2.json() : {};
      customer = (custData2.customers || [])[0] || null;
    }

    // ── 2. Datos de Redis ──
    const [cachedName, storedStore, promoStatus] = await Promise.all([
      redis.get(`client_name_${phone}`),
      redis.get(`client_store_${phone}`),
      redis.get(`promo_pos_${phone}`)
    ]);

    // ── 3. Parsear nota del cliente para extraer dirección/tienda ──
    let tienda = storedStore || '';
    let address = '';
    if (customer?.note) {
      const note = customer.note;
      const tiendaM = note.match(/Tienda:\s*(.+?)(?:\n|$)/);
      if (tiendaM) tienda = tiendaM[1].trim();
      const calleM = note.match(/Calle:\s*(.+?)(?:\n|$)/);
      const numM = note.match(/Número:\s*(.+?)(?:\n|$)/);
      const colM = note.match(/Colonia:\s*(.+?)(?:\n|$)/);
      const munM = note.match(/Municipio:\s*(.+?)(?:\n|$)/);
      const parts = [calleM?.[1], numM?.[1], colM?.[1], munM?.[1]].filter(Boolean);
      address = parts.join(', ');
    }

    // ── 4. Compras recientes (receipts) ──
    let receipts = [];
    if (customer?.id) {
      const recRes = await fetch(`${BASE}/receipts?customer_id=${customer.id}&limit=15`, { headers });
      if (recRes.ok) {
        const recData = await recRes.json();
        // Obtener nombres de stores
        const storeIds = [...new Set((recData.receipts || []).map(r => r.store_id).filter(Boolean))];
        let storeMap = {};
        if (storeIds.length) {
          const sRes = await fetch(`${BASE}/stores`, { headers });
          if (sRes.ok) {
            const sData = await sRes.json();
            for (const s of sData.stores || []) storeMap[s.id] = s.name;
          }
        }
        receipts = (recData.receipts || []).map(r => ({
          date: r.receipt_date || r.created_at || null,
          store: storeMap[r.store_id] || r.store_id || 'Sucursal',
          total: r.total_money ?? r.total ?? 0,
          items: (r.line_items || []).length
        })).sort((a, b) => new Date(b.date) - new Date(a.date));
      }
    }

    // ── 5. Cupones canjeados (filtrar log global por teléfono) ──
    const allLogs = await redis.lrange('redeemed_coupons_log', 0, 500);
    const coupons = allLogs
      .map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return null; } })
      .filter(l => {
        if (!l) return false;
        const lPhone = (l.phone || l.clientPhone || '').replace(/\D/g, '');
        return lPhone.endsWith(phone10);
      })
      .sort((a, b) => new Date(b.receiptDate || 0) - new Date(a.receiptDate || 0))
      .slice(0, 20);

    const name = cachedName || customer?.name || phone10;
    const points = customer?.total_points ?? 0;
    const email = customer?.email || '';
    const customerId = customer?.id || null;

    return NextResponse.json({
      success: true,
      client: { name, phone, phone10, points, email, tienda, address, customerId, promoStatus },
      receipts,
      coupons
    });
  } catch (e) {
    console.error('[client-card]', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
