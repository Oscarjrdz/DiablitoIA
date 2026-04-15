import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Get YYYY-MM-DD string for a receipt in America/Monterrey timezone */
function receiptDateMty(createdAt) {
  return new Date(createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
}

/** Get today's YYYY-MM-DD in Monterrey timezone */
function todayMty() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
}

/** Enumerate all YYYY-MM-DD strings between two ISO timestamps (Monterrey-aligned) */
function enumerateDates(startIso, endIso) {
  const startStr = new Date(startIso).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const endStr = new Date(endIso).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const dates = [];
  const cur = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  while (cur <= last) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Aggregate an array of receipts into per-store data */
function aggregateReceipts(receipts, storeIds, variantMap) {
  const byStore = {};
  storeIds.forEach(sid => {
    byStore[sid] = {
      ventasBrutas: 0, reembolsos: 0, totalTickets: 0,
      papasStats: { criscut: { qty: 0, total: 0 }, gajo: { qty: 0, total: 0 } },
      byHour: {},
      products: {},
      lastReceipt: null,
      firstReceipt: null
    };
  });

  receipts.forEach(r => {
    if (r.cancelled_at) return;
    const sid = r.store_id;
    if (!byStore[sid]) return;

    const agg = byStore[sid];
    const isRefund = r.receipt_type === 'REFUND';
    const v = Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0);

    if (isRefund) {
      agg.reembolsos += Math.abs(r.total_money || 0);
    } else {
      agg.ventasBrutas += v;
      agg.totalTickets++;
      if (!agg.lastReceipt || r.created_at > agg.lastReceipt.created_at)
        agg.lastReceipt = { created_at: r.created_at, total_money: r.total_money, total_discount: r.total_discount };
      if (!agg.firstReceipt || r.created_at < agg.firstReceipt.created_at)
        agg.firstReceipt = { created_at: r.created_at, total_money: r.total_money, total_discount: r.total_discount };

      const hour = new Date(new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/Monterrey' })).getHours();
      agg.byHour[hour] = (agg.byHour[hour] || 0) + v;
    }

    if (r.line_items) {
      r.line_items.forEach(item => {
        let itemName = item.item_name || 'Sin nombre';
        // If this item has a variant with a different name, append it
        if (item.variant_id && variantMap && variantMap[item.variant_id]) {
          itemName = itemName + ' — ' + variantMap[item.variant_id];
        }
        const q = item.quantity || 1;
        const amt = item.total_money || 0;
        const lowerName = itemName.toLowerCase();

        if (!isRefund) {
          let cQ = 0, cA = 0, gQ = 0, gA = 0;
          if (lowerName.includes('cambio a papa cris') || lowerName.includes('cambio a papa criss')) { cQ += q; cA += amt; }
          else if (lowerName.includes('cambio a papa gajo')) { gQ += q; gA += amt; }
          (item.line_modifiers || item.modifiers || []).forEach(mod => {
            const modName = ((mod.name || '') + ' ' + (mod.option || '')).toLowerCase();
            const modAmt = mod.money_amount !== undefined ? mod.money_amount : (mod.price || 0);
            if (modName.includes('cambio a papa cris') || modName.includes('cambio a papa criss')) { cQ += q; cA += modAmt; }
            else if (modName.includes('cambio a papa gajo')) { gQ += q; gA += modAmt; }
          });
          agg.papasStats.criscut.qty += cQ; agg.papasStats.criscut.total += cA;
          agg.papasStats.gajo.qty += gQ; agg.papasStats.gajo.total += gA;
        }

        if (!agg.products[itemName]) agg.products[itemName] = { quantity: 0, total: 0 };
        if (isRefund) { agg.products[itemName].quantity -= q; agg.products[itemName].total -= amt; }
        else { agg.products[itemName].quantity += q; agg.products[itemName].total += amt; }
      });
    }
  });

  return byStore;
}

/** Merge source store-aggregate INTO target (mutates target) */
function mergeInto(target, source) {
  target.ventasBrutas += source.ventasBrutas;
  target.reembolsos += (source.reembolsos || 0);
  target.totalTickets += source.totalTickets;
  target.papasStats.criscut.qty += source.papasStats.criscut.qty;
  target.papasStats.criscut.total += source.papasStats.criscut.total;
  target.papasStats.gajo.qty += source.papasStats.gajo.qty;
  target.papasStats.gajo.total += source.papasStats.gajo.total;

  Object.entries(source.byHour || {}).forEach(([h, v]) => { target.byHour[h] = (target.byHour[h] || 0) + v; });

  Object.entries(source.products || {}).forEach(([name, d]) => {
    if (!target.products[name]) target.products[name] = { quantity: 0, total: 0 };
    target.products[name].quantity += d.quantity;
    target.products[name].total += d.total;
  });

  if (source.lastReceipt && (!target.lastReceipt || source.lastReceipt.created_at > target.lastReceipt.created_at))
    target.lastReceipt = source.lastReceipt;
  if (source.firstReceipt && (!target.firstReceipt || source.firstReceipt.created_at < target.firstReceipt.created_at))
    target.firstReceipt = source.firstReceipt;
}

function formatTicket(r) {
  if (!r) return null;
  const d = new Date(r.created_at);
  let time = d.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });
  time = time.replace(/ (a\.?m\.?|p\.?m\.?|AM|PM)/i, '').trim();
  return { time, amount: Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0) };
}

function emptyAgg() {
  return {
    ventasBrutas: 0, reembolsos: 0, totalTickets: 0,
    papasStats: { criscut: { qty: 0, total: 0 }, gajo: { qty: 0, total: 0 } },
    byHour: {}, products: {}, lastReceipt: null, firstReceipt: null
  };
}

/** Build the final frontend-compatible response payload from daily aggregates */
function buildResponse(dailyEntries, stores, storeFilter, latestShiftsMap) {
  const allIds = stores.map(s => s.id);
  const targetIds = storeFilter === 'all' ? allIds : [storeFilter];

  const combined = emptyAgg();
  const byDay = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const perStore = {};
  allIds.forEach(sid => { perStore[sid] = emptyAgg(); });

  dailyEntries.forEach(({ dateStr, byStore }) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();

    targetIds.forEach(sid => {
      if (!byStore[sid]) return;
      mergeInto(combined, byStore[sid]);
      byDay[dow] += byStore[sid].ventasBrutas;
    });

    allIds.forEach(sid => {
      if (!byStore[sid]) return;
      mergeInto(perStore[sid], byStore[sid]);
    });
  });

  // ── ventasPorDia ──
  const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const totalByDay = Object.values(byDay).reduce((s, v) => s + v, 0);
  const maxByDay = Math.max(...Object.values(byDay));
  const ventasPorDia = [1, 2, 3, 4, 5, 6, 0].map(i => ({
    label: dayNames[i], venta: byDay[i],
    pct: totalByDay > 0 ? (byDay[i] / totalByDay * 100).toFixed(1) : '0.0',
    bar: maxByDay > 0 ? (byDay[i] / maxByDay * 100) : 0
  }));

  // ── ventasPorHora ──
  const hourMap = {};
  for (let h = 0; h < 24; h++) hourMap[h] = combined.byHour[h] || 0;
  const totalByHour = Object.values(hourMap).reduce((s, v) => s + v, 0);
  const maxByHour = Math.max(...Object.values(hourMap));
  const ventasPorHora = Array.from({ length: 24 }, (_, h) => ({
    label: h.toString().padStart(2, '0') + ':00', venta: hourMap[h],
    pct: totalByHour > 0 ? (hourMap[h] / totalByHour * 100).toFixed(1) : '0.0',
    bar: maxByHour > 0 ? (hourMap[h] / maxByHour * 100) : 0
  })).filter(r => r.venta > 0);

  // ── productGrid (group variants under parent product) ──
  const groupsMap = {};
  Object.entries(combined.products).forEach(([fullName, d]) => {
    if (d.quantity <= 0) return;
    const sep = fullName.indexOf(' — ');
    const baseName = sep > -1 ? fullName.substring(0, sep) : fullName;
    const variantName = sep > -1 ? fullName.substring(sep + 3) : null;

    if (!groupsMap[baseName]) groupsMap[baseName] = { name: baseName, quantity: 0, total: 0, items: {} };
    groupsMap[baseName].quantity += d.quantity;
    groupsMap[baseName].total += d.total;

    const subKey = variantName || baseName;
    if (!groupsMap[baseName].items[subKey]) groupsMap[baseName].items[subKey] = { quantity: 0, total: 0 };
    groupsMap[baseName].items[subKey].quantity += d.quantity;
    groupsMap[baseName].items[subKey].total += d.total;
  });

  const productGrid = Object.values(groupsMap)
    .map(g => {
      const itemsArr = Object.entries(g.items).map(([n, d]) => ({ name: n, ...d })).sort((a, b) => b.total - a.total);
      const isGroup = itemsArr.length > 1 || (itemsArr.length === 1 && itemsArr[0].name !== g.name);
      return { name: g.name, quantity: g.quantity, total: g.total, isGroup, items: itemsArr };
    })
    .sort((a, b) => b.total - a.total);

  // ── KPIs ──
  const kpisFull = {
    ventasBrutas: combined.ventasBrutas,
    reembolsos: combined.reembolsos,
    ventasNetas: combined.ventasBrutas - combined.reembolsos,
    totalTickets: combined.totalTickets,
    papasStats: combined.papasStats,
    ventaDeHoy: 0,
    ticketPromedio: combined.totalTickets > 0 ? combined.ventasBrutas / combined.totalTickets : 0,
    lastTicketInfo: formatTicket(combined.lastReceipt)
  };

  // ── storeKpis ──
  const storeKpisArray = stores.map(s => {
    const ps = perStore[s.id];
    const sk = {
      id: s.id, name: s.name,
      ventasBrutas: ps.ventasBrutas, totalTickets: ps.totalTickets,
      papasStats: ps.papasStats,
      lastTicketInfo: formatTicket(ps.lastReceipt)
    };

    const shift = latestShiftsMap[s.id];
    let shiftOpen = null;
    if (shift && shift.opened_at) {
      const sd = new Date(shift.opened_at);
      let tStr = sd.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });
      tStr = tStr.replace(/ (a\.?m\.?|p\.?m\.?|AM|PM)/i, '').trim();
      const todayLimit = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
      todayLimit.setHours(0, 0, 0, 0);
      if (sd < todayLimit) tStr += ' (Arrastrado de Ayer)';
      shiftOpen = { time: tStr };
    }
    sk.firstTicketInfo = shiftOpen || formatTicket(ps.firstReceipt);
    return sk;
  })
  .filter(sk => sk.ventasBrutas > 0)
  .sort((a, b) => b.ventasBrutas - a.ventasBrutas);

  return { stores, kpis: kpisFull, allStoresKpi: kpisFull, storeKpis: storeKpisArray, ventasPorDia, ventasPorHora, productGrid };
}

/* ═══════════════════════════════════════════════════════════════
   MAIN API ROUTE
   ═══════════════════════════════════════════════════════════════ */

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });

    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const storeFilter = searchParams.get('store') || 'all';
    if (!start || !end) return NextResponse.json({ error: 'Start and end dates are required' }, { status: 400 });

    const tp = token.substring(0, 15); // token prefix for cache keys
    const authHeaders = { Authorization: token };
    const t0 = Date.now();

    // ── 1. Stores (cached 24h) ──
    let stores;
    const cachedStores = await redis.get(`stores:${tp}`);
    if (cachedStores) {
      stores = typeof cachedStores === 'string' ? JSON.parse(cachedStores) : cachedStores;
    } else {
      const res = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch stores');
      stores = (await res.json()).stores;
      await redis.setex(`stores:${tp}`, 86400, JSON.stringify(stores));
    }
    const storeIds = stores.map(s => s.id);

    // ── 1b. Variant map (cached 24h) — maps variant_id → display name ──
    let variantMap = {};
    const varCacheKey = `variants:${tp}`;
    const cachedVariants = await redis.get(varCacheKey);
    if (cachedVariants) {
      variantMap = typeof cachedVariants === 'string' ? JSON.parse(cachedVariants) : cachedVariants;
    } else {
      try {
        let allItems = [], itemCursor = null, itemHasMore = true;
        while (itemHasMore) {
          let itemsUrl = 'https://api.loyverse.com/v1.0/items?limit=250';
          if (itemCursor) itemsUrl += `&cursor=${itemCursor}`;
          const itemsRes = await fetch(itemsUrl, { headers: authHeaders });
          if (itemsRes.ok) {
            const itemsData = await itemsRes.json();
            if (itemsData.items?.length) allItems = allItems.concat(itemsData.items);
            itemCursor = itemsData.cursor || null;
            itemHasMore = !!itemCursor;
          } else { itemHasMore = false; }
        }
        allItems.forEach(item => {
          if (item.variants?.length > 1) {
            item.variants.forEach(v => {
              const label = v.option1_value || v.option2_value || v.option3_value;
              if (label && v.variant_id) {
                variantMap[v.variant_id] = label;
              }
            });
          }
        });
        await redis.setex(varCacheKey, 86400, JSON.stringify(variantMap));
        console.log(`[Dashboard] Cached ${Object.keys(variantMap).length} variant mappings`);
      } catch (e) { console.error('[Dashboard] variant fetch error:', e.message); }
    }

    // ── 2. Shifts (always live for opening time) ──
    let latestShiftsMap = {};
    try {
      const res = await fetch('https://api.loyverse.com/v1.0/shifts?limit=50', { headers: authHeaders });
      if (res.ok) {
        const d = await res.json();
        (d.shifts || []).forEach(sh => { if (!latestShiftsMap[sh.store_id]) latestShiftsMap[sh.store_id] = sh; });
      }
    } catch (e) { console.error('[Dashboard] shifts error:', e.message); }

    // ── 3. Enumerate all days in the requested range ──
    const allDates = enumerateDates(start, end);
    const today = todayMty();

    // ── 4. Check Redis cache for completed (past) days ──
    const dailyEntries = [];
    const uncachedDates = [];

    for (const dateStr of allDates) {
      if (dateStr >= today) {
        // Today or future → always fetch live
        uncachedDates.push(dateStr);
        continue;
      }
      // Past day → check cache
      const cached = await redis.get(`daily:${tp}:${dateStr}`);
      if (cached) {
        dailyEntries.push({ dateStr, byStore: typeof cached === 'string' ? JSON.parse(cached) : cached });
      } else {
        uncachedDates.push(dateStr);
      }
    }

    const fromCache = dailyEntries.length;
    console.log(`[Dashboard] ${fromCache} days from cache, ${uncachedDates.length} to fetch (today=${today})`);

    // ── 5. Fetch receipts from Loyverse ONLY for uncached days ──
    if (uncachedDates.length > 0) {
      let fetchStart, fetchEnd;

      if (uncachedDates.length === 1 && uncachedDates[0] === today) {
        // 🚀 FAST PATH: only today needs fetching — use tight UTC-padded boundaries
        const [ty, tm, td] = today.split('-').map(Number);
        fetchStart = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0)).toISOString();
        fetchEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0)).toISOString();
      } else {
        // Full range — use original frontend boundaries (timezone-correct)
        fetchStart = start;
        fetchEnd = end;
      }

      let allReceipts = [];
      let cursor = null;
      let hasMore = true;

      while (hasMore) {
        let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${fetchStart}&created_at_max=${fetchEnd}&limit=250`;
        if (cursor) url += `&cursor=${cursor}`;
        const res = await fetch(url, { headers: authHeaders });
        if (!res.ok) throw new Error('Failed to fetch receipts');
        const data = await res.json();
        if (data.receipts?.length) allReceipts = allReceipts.concat(data.receipts);
        cursor = data.cursor || null;
        hasMore = !!cursor;
      }

      console.log(`[Dashboard] Fetched ${allReceipts.length} receipts from Loyverse API`);

      // Group receipts by Monterrey date
      const receiptsByDate = {};
      uncachedDates.forEach(d => { receiptsByDate[d] = []; });

      allReceipts.forEach(r => {
        const ds = receiptDateMty(r.created_at);
        if (receiptsByDate[ds]) receiptsByDate[ds].push(r);
      });

      // Aggregate each day & cache completed days (90-day TTL)
      for (const dateStr of uncachedDates) {
        const byStore = aggregateReceipts(receiptsByDate[dateStr] || [], storeIds, variantMap);
        dailyEntries.push({ dateStr, byStore });

        if (dateStr < today) {
          await redis.setex(`daily:${tp}:${dateStr}`, 90 * 86400, JSON.stringify(byStore));
          console.log(`[Dashboard] ✅ Cached day: ${dateStr}`);
        }
      }
    }

    // ── 6. Build & return response ──
    dailyEntries.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    const processedData = buildResponse(dailyEntries, stores, storeFilter, latestShiftsMap);

    const elapsed = Date.now() - t0;
    console.log(`[Dashboard] Response built in ${elapsed}ms (${fromCache} cached + ${uncachedDates.length} live)`);

    return NextResponse.json({
      success: true,
      data: processedData,
      cached: false,
      _perf: { ms: elapsed, fromCache, fromApi: uncachedDates.length }
    });

  } catch (error) {
    console.error('[Dashboard]', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
