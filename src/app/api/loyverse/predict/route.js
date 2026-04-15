import { NextResponse } from 'next/server';
import { subDays, addDays, format, parseISO, getDay, startOfDay, endOfDay, differenceInCalendarWeeks } from 'date-fns';
import { redis } from '@/lib/redis';


// Simple Average: Only removes zeros.
function evaluateTrimmedDays(items) {
  return items.map(item => {
    let discarded = false;
    let reason = '';
    if (item.val === 0) {
      discarded = true;
      reason = 'Cero';
    }
    return { ...item, discarded, reason };
  });
}

function calcTrimmedAvg(items) {
  const evaluatedDays = evaluateTrimmedDays(items);
  // 1. Remove zeros
  const nonZeros = items.filter(item => item.val > 0);
  
  if (nonZeros.length === 0) return { avg: 0, trace: "Puros ceros (0), promedio: 0", days: evaluatedDays };
  if (nonZeros.length <= 2) {
    const sum = nonZeros.reduce((a, b) => a + b.val, 0);
    const traceItems = nonZeros.map(i => `${i.label}: ${Math.round(i.val)}`).join(' | ');
    return { avg: sum / nonZeros.length, trace: `Solo ${nonZeros.length} días activos [${traceItems}]. Promedio: ${Math.round(sum/nonZeros.length)}`, days: evaluatedDays };
  }

  // 2. Find max and min
  const maxVal = Math.max(...nonZeros.map(i => i.val));
  const minVal = Math.min(...nonZeros.map(i => i.val));
  
  // 3. Remove exactly ONE max and ONE min
  let removedMax = false;
  let removedMin = false;
  const filtered = [];
  
  for (let i = 0; i < nonZeros.length; i++) {
    const item = nonZeros[i];
    if (!removedMax && item.val === maxVal) {
      removedMax = true;
      continue;
    }
    if (!removedMin && item.val === minVal) {
      removedMin = true;
      continue;
    }
    filtered.push(item);
  }
  
  if (filtered.length === 0) return { avg: 0, trace: "Todo se filtró", days: evaluatedDays };
  
  // 4. Sum and divide
  const sum = filtered.reduce((a, b) => a + b.val, 0);
  const avg = sum / filtered.length;
  
  const rawStr = items.map(i => `${i.label}: ${Math.round(i.val)}`).join(' | ');
  const nonZerosStr = nonZeros.map(i => `${i.label}: ${Math.round(i.val)}`).join(' | ');
  const filteredStr = filtered.map(i => `${i.label}: ${Math.round(i.val)}`).join(' | ');
  
  const traceStr = `Valores crudos: [${rawStr}] -> Quitamos ceros: [${nonZerosStr}] -> Quitamos el mayor (${Math.round(maxVal)}) y menor (${Math.round(minVal)}) -> Queda: [${filteredStr}]. Suma = ${Math.round(sum)} / ${filtered.length} días = ${Math.round(avg)}`;
  
  return { avg, trace: traceStr, days: evaluatedDays };
}

function calcStoreForecast(receipts, targetDate, targetDayOfWeek) {
  // Find all historical Tuesdays in the range (EXCLUDING today to avoid partial data)
  const targetDateStr = format(targetDate, 'yyyy-MM-dd');

  const sameDayReceipts = receipts.filter(r => {
    if (r.cancelled_at) return false;
    const d = parseISO(r.created_at);
    // Exclude today's partial data
    const receiptDateStr = format(d, 'yyyy-MM-dd');
    if (receiptDateStr === targetDateStr) return false;
    return getDay(d) === targetDayOfWeek;
  });

  // Determine which weeks had same-day-of-week data (1 = last week, 2 = two weeks ago, etc.)
  const allWeeksInRange = [];
  const dailyTotals = {};
  const dailyTotalUnits = {};
  for (let w = 1; w <= 8; w++) {
    allWeeksInRange.push(w);
    dailyTotals[w] = 0;
    dailyTotalUnits[w] = 0;
  }

  const productWeekly = {};

  sameDayReceipts.forEach(r => {
    const receiptDate = parseISO(r.created_at);
    const weeksAgo = differenceInCalendarWeeks(targetDate, receiptDate, { weekStartsOn: 1 });
    if (weeksAgo < 1 || weeksAgo > 8) return;
    const isRefund = r.receipt_type === 'REFUND';

    r.line_items?.forEach(item => {
      const name = item.item_name || 'Sin nombre';
      if (!productWeekly[name]) productWeekly[name] = { qty: {}, rev: {} };
      if (!productWeekly[name].qty[weeksAgo]) productWeekly[name].qty[weeksAgo] = 0;
      if (!productWeekly[name].rev[weeksAgo]) productWeekly[name].rev[weeksAgo] = 0;

      if (isRefund) {
        productWeekly[name].qty[weeksAgo] -= Math.abs(item.quantity || 0);
        productWeekly[name].rev[weeksAgo] -= Math.abs(item.total_money || 0);
        dailyTotals[weeksAgo] -= Math.abs(item.total_money || 0);
        dailyTotalUnits[weeksAgo] -= Math.abs(item.quantity || 0);
      } else {
        productWeekly[name].qty[weeksAgo] += (item.quantity || 0);
        productWeekly[name].rev[weeksAgo] += (item.total_money || 0);
        dailyTotals[weeksAgo] += (item.total_money || 0);
        dailyTotalUnits[weeksAgo] += (item.quantity || 0);
      }
    });
  });

  // Evaluate global trimmed days first
  const globalWeeks = [];
  for (let w = 1; w <= 8; w++) {
    const exactDay = subDays(targetDate, w * 7);
    globalWeeks.push({ w, label: format(exactDay, 'dd/MMM'), val: dailyTotals[w] || 0, units: dailyTotalUnits[w] || 0 });
  }
  const evaluatedGlobalDays = evaluateTrimmedDays(globalWeeks);
  
  const discardedWeeks = new Set();
  const activeWeeks = new Set();
  evaluatedGlobalDays.forEach(d => {
    if (d.discarded) discardedWeeks.add(d.w);
    else activeWeeks.add(d.w);
  });
  const activeCount = activeWeeks.size > 0 ? activeWeeks.size : 1;
  let activeSumUnits = 0;
  let activeSumRev = 0;
  evaluatedGlobalDays.forEach(d => {
    if (!d.discarded) {
      activeSumUnits += d.units;
      activeSumRev += d.val;
    }
  });

  const predictions = {};
  Object.entries(productWeekly).forEach(([name, weekData]) => {
    const productDays = [];
    for (let w = 1; w <= 8; w++) {
      const exactDay = subDays(targetDate, w * 7);
      const label = format(exactDay, 'dd/MMM');
      const val = weekData.qty[w] || 0;
      const rev = weekData.rev[w] || 0;
      const globalDay = evaluatedGlobalDays.find(gd => gd.w === w);
      
      productDays.push({
        w,
        label,
        val,
        rev,
        discarded: discardedWeeks.has(w),
        reason: globalDay ? globalDay.reason : ''
      });
    }

    let sumUnits = 0;
    let sumRev = 0;
    productDays.forEach(d => {
      if (!d.discarded) {
        sumUnits += d.val;
        sumRev += d.rev;
      }
    });

    const forecastUnits = Math.round(sumUnits / activeCount);
    // REMOVED THE ARTIFICIAL RULE: 
    // Now even if units round down to 0, we still forecast the real fractional money of that slot 
    // so the global sum perfectly matches the pure math.
    const forecastRevenue = Math.round((sumRev / activeCount) * 100) / 100;
    const avgUnits = forecastUnits; // Historic average matches forecast in global trim mode

    predictions[name] = { forecastUnits, forecastRevenue, avgUnits, weeksUsed: 8, days: productDays, traceUnits: 'Global Trim', traceRev: 'Global Trim' };
  });

  return { predictions, weeksFound: 8, dailyTotals, dailyTotalUnits, evaluatedGlobalDays };
}

export async function GET(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const dateParam = searchParams.get('date');
        let storeParam = searchParams.get('store') || 'all';

    let targetDate;
    if (dateParam) {
      const [y, m, d] = dateParam.split('-');
      targetDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    } else {
      targetDate = new Date();
    }

    const targetDateStr = format(targetDate, 'yyyy-MM-dd');
    const targetDayOfWeek = getDay(targetDate);
    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const targetDayName = dayNames[targetDayOfWeek];

    // v3 cache key to invalidate old cached data
    const cacheKey = `forecast:v7:${token.substring(0, 15)}:${targetDateStr}:${storeParam}`;
    const cachedData = await redis.get(cacheKey);
    if (cachedData) {
      return NextResponse.json({
        success: true,
        data: typeof cachedData === 'string' ? JSON.parse(cachedData) : cachedData,
        cached: true
      });
    }

    const headers = { 'Authorization': token };

    const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers });
    if (!storesRes.ok) throw new Error('Failed to fetch stores');
    const { stores } = await storesRes.json();
    
    // Fallback if 'all' is passed (we removed 'all stores' feature)
    if (storeParam === 'all' && stores.length > 0) {
      storeParam = stores[0].id;
    }

    // Instead of fetching 60 days of consecutive receipts (causing Vercel timeout),
    // we only fetch the exactly 8 required days in parallel to drastically improve performance.
    let allReceipts = [];
    const fetchDay = async (w) => {
      const exactDay = subDays(targetDate, w * 7);
      // Pad by +/- 1 day to catch all TZ offset bounds for the local day matching (UTC issue)
      const startIso = startOfDay(subDays(exactDay, 1)).toISOString();
      const endIso = endOfDay(addDays(exactDay, 1)).toISOString();
      
      let dayReceipts = [];
      let cursor = null;
      let hasMore = true;
      let safetyCounter = 0; // limit to 20 pages max (~5k receipts per 3-day block) => safe
      
      while (hasMore && safetyCounter < 20) {
        safetyCounter++;
        let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${startIso}&created_at_max=${endIso}&limit=250`;
        if (cursor) url += `&cursor=${cursor}`;
        const res = await fetch(url, { headers });
        if (!res.ok) break;
        const data = await res.json();
        if (data.receipts && data.receipts.length > 0) {
          dayReceipts = dayReceipts.concat(data.receipts);
        }
        cursor = data.cursor || null;
        hasMore = !!cursor;
      }
      return dayReceipts;
    };

    const weeksPromises = [];
    for (let w = 1; w <= 8; w++) {
      weeksPromises.push(fetchDay(w));
    }
    
    const receiptArrays = await Promise.all(weeksPromises);
    
    // De-duplicate receipts since 3-day blocks might slightly overlap if exactly adjoining, 
    // although weeks are separated by 7 days. Better safe deduplication.
    const seenTx = new Set();
    receiptArrays.forEach(arr => {
      arr.forEach(r => {
        if (!seenTx.has(r.receipt_number)) {
          seenTx.add(r.receipt_number);
          allReceipts.push(r);
        }
      });
    });

    let predictions;
    let weeksAnalyzed = 0;

    const storeReceipts = allReceipts.filter(r => r.store_id === storeParam);
    const result = calcStoreForecast(storeReceipts, targetDate, targetDayOfWeek);
    predictions = Object.entries(result.predictions).map(([name, d]) => ({ name, ...d }));
    weeksAnalyzed = result.weeksFound;
      
    predictions.sort((a, b) => b.forecastRevenue - a.forecastRevenue);

    const historicalDays = result.evaluatedGlobalDays;
    const activeDays = historicalDays.filter(d => !d.discarded);
    const activeCount = activeDays.length;
    const activeSumUnits = activeDays.reduce((sum, d) => sum + d.units, 0);
    const activeSumRev = activeDays.reduce((sum, d) => sum + d.val, 0);
    
    // Ensure perfect match by summing up the product forecasts 
    // instead of dividing the activeDays total, since rounding differences or 
    // product-level trimming can cause micro mismatches.
    const totalForecastUnits = predictions.reduce((s, p) => s + p.forecastUnits, 0);
    const totalForecastRevenue = predictions.reduce((s, p) => s + p.forecastRevenue, 0);

    const responseData = {
      targetDate: targetDateStr,
      targetDayName,
      weeksAnalyzed,
      totalProducts: predictions.length,
      totalForecastUnits,
      totalForecastRevenue,
      activeCount,
      activeSumUnits,
      activeSumRev,
      historicalDays,
      store: storeParam,
      stores,
      predictions
    };

    await redis.setex(cacheKey, 21600, JSON.stringify(responseData));

    return NextResponse.json({
      success: true,
      data: responseData,
      cached: false
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to generate forecast' }, { status: 500 });
  }
}
