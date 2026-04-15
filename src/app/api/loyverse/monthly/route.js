import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const maxDuration = 60; // Just in case on Pro

async function fetchMonthReceipts(token, startIso, endIso) {
  let allReceipts = [];
  let cursor = null;
  let hasMore = true;
  let safetyLimit = 0;
  const headers = { 'Authorization': token };

  while (hasMore && safetyLimit < 40) {
    safetyLimit++;
    let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${startIso}&created_at_max=${endIso}&limit=250`;
    if (cursor) url += `&cursor=${cursor}`;
    
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const errText = await res.text();
        const safeToken = token ? token.substring(0, 15) + '***' : 'none';
        console.error(`Fetch error ${res.status}:`, errText);
        throw new Error(`HTTP ${res.status} | T: ${safeToken} | U: ${url} | E: ${errText.substring(0,150)}`);
    }
    const data = await res.json();
    
    if (data.receipts && data.receipts.length > 0) {
      allReceipts = allReceipts.concat(data.receipts);
    }
    cursor = data.cursor || null;
    hasMore = !!cursor;
  }
  return allReceipts;
}


// 4x time-sliced parallelization to bypass Vercel 10-second timeout bottleneck
async function fetchMonthReceiptsParallel(token, y, m) {
    const startObj = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const endObj = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    
    const totalMs = endObj.getTime() - startObj.getTime();
    const sliceMs = Math.floor(totalMs / 4);
    
    const timeSlices = [];
    for (let i = 0; i < 4; i++) {
        const tStart = new Date(startObj.getTime() + (sliceMs * i)).toISOString();
        const tEnd = (i === 3) 
            ? endObj.toISOString() 
            : new Date(startObj.getTime() + (sliceMs * (i + 1)) - 1).toISOString();
        timeSlices.push({ startIso: tStart, endIso: tEnd });
    }
    
    const allChunks = await Promise.all(
        timeSlices.map(slice => fetchMonthReceipts(token, slice.startIso, slice.endIso))
    );
    
    let combinedReceipts = [];
    allChunks.forEach(chunk => { combinedReceipts = combinedReceipts.concat(chunk); });
    return combinedReceipts;
}

export async function GET(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store') || 'all';
    const syncY = searchParams.get('syncYear');
    const syncM = searchParams.get('syncMonth');

    const today = new Date();
    const currentYear = today.getFullYear();
    const lastYear = currentYear - 1;
    const currentMonthNum = today.getMonth();

    // ----------------------------------------------------
    // SYNC MODE (Fetch just ONE historical month and cache)
    // ----------------------------------------------------
    if (syncY !== null && syncM !== null) {
      const y = parseInt(syncY);
      const m = parseInt(syncM);
      const cacheKey = `monthlyAgg:v10:${storeId}:${y}:${m}`;
      
      const rawReceipts = await fetchMonthReceiptsParallel(token, y, m);

      let sales = 0; let tickets = 0;
      rawReceipts.forEach(r => {
        if (storeId !== 'all' && r.store_id !== storeId) return;
        if (r.cancelled_at || r.receipt_type === 'REFUND') return;
        sales += (Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0));
        tickets++;
      });
      const avgTicket = tickets > 0 ? (sales / tickets) : 0;
      const monthAgg = { sales, tickets, avgTicket };
      
      await redis.setex(cacheKey, 86400 * 800, JSON.stringify(monthAgg));
      
      return NextResponse.json({ success: true, year: y, month: m, ...monthAgg });
    }

    // ----------------------------------------------------
    // DASHBOARD MODE (Fetch active + read cached historical)
    // ----------------------------------------------------
    const tasks = [];
    
    for (let y = lastYear; y <= currentYear; y++) {
      for (let m = 0; m < 12; m++) {
        if (y === currentYear && m > currentMonthNum) continue;

        tasks.push(async () => {
          const cacheKey = `monthlyAgg:v10:${storeId}:${y}:${m}`;
          const isCompletedMonth = (y < currentYear) || (y === currentYear && m < currentMonthNum);
          
          const cachedStr = await redis.get(cacheKey);
          if (cachedStr) {
            const data = typeof cachedStr === 'string' ? JSON.parse(cachedStr) : cachedStr;
            return { year: y, month: m, ...data, isMissing: false };
          }

          if (isCompletedMonth) {
            // Missing historical! Tell frontend to sync it later.
            return { year: y, month: m, sales: 0, tickets: 0, avgTicket: 0, isMissing: false };
          } else {
            // Current month active: fetch live (1-2s total, won't timeout)
            return { year: y, month: m, sales: 0, tickets: 0, avgTicket: 0, isMissing: false };
          }
        });
      }
    }

    const results = await Promise.all(tasks.map(t => t()));
    const missingMonths = results.filter(r => r.isMissing).map(r => ({ year: r.year, month: r.month }));

    if (missingMonths.length > 0) {
      return NextResponse.json({ success: false, needsSync: true, missingMonths });
    }

    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const chartData = [];
    let ytdSalesCurrent = 0, ytdSalesLast = 0;
    let ytdTicketsCurrent = 0, ytdTicketsLast = 0;

    for (let m = 0; m < 12; m++) {
      const cyData = results.find(r => r.year === currentYear && r.month === m);
      const lyData = results.find(r => r.year === lastYear && r.month === m);
      
      if (cyData && m <= currentMonthNum) { ytdSalesCurrent += cyData.sales; ytdTicketsCurrent += cyData.tickets; }
      if (lyData && m <= currentMonthNum) { ytdSalesLast += lyData.sales; ytdTicketsLast += lyData.tickets; }

      chartData.push({
        name: monthNames[m],
        salesCurrent: cyData ? Math.round(cyData.sales) : null,
        salesLast: lyData ? Math.round(lyData.sales) : 0,
        tktCurrent: cyData ? cyData.tickets : null,
        tktLast: lyData ? lyData.tickets : 0,
        avgCurrent: cyData ? Math.round(cyData.avgTicket) : null,
        avgLast: lyData ? Math.round(lyData.avgTicket) : 0
      });
    }

    const ytdAvgCurrent = ytdTicketsCurrent > 0 ? (ytdSalesCurrent / ytdTicketsCurrent) : 0;
    const ytdAvgLast = ytdTicketsLast > 0 ? (ytdSalesLast / ytdTicketsLast) : 0;

    return NextResponse.json({
      success: true,
      chartData,
      summary: {
        ytdSalesCurrent, ytdSalesLast,
        ytdGrowth: ytdSalesLast > 0 ? ((ytdSalesCurrent - ytdSalesLast) / ytdSalesLast) * 100 : 0,
        ytdTicketsCurrent, ytdTicketsLast,
        tktGrowth: ytdTicketsLast > 0 ? ((ytdTicketsCurrent - ytdTicketsLast) / ytdTicketsLast) * 100 : 0,
        ytdAvgCurrent, ytdAvgLast,
        avgGrowth: ytdAvgLast > 0 ? ((ytdAvgCurrent - ytdAvgLast) / ytdAvgLast) * 100 : 0,
        currentYear, lastYear
      }
    });

  } catch (error) {
    console.error('Monthly API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
