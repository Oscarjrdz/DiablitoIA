import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Auth required' }, { status: 401 });

    const body = await req.json();
    const { storeId, year, month, sales, tickets, avgTicket } = body;

    // Use the exact cacheKey structure expected by MonthlySalesChart
    const cacheKey = `monthlyAgg:v10:${storeId}:${year}:${month}`;

    const monthAgg = { sales, tickets, avgTicket };
    
    // Persist forever (or ~2 years)
    await redis.setex(cacheKey, 86400 * 800, JSON.stringify(monthAgg));

    return NextResponse.json({ success: true, cacheKey, data: monthAgg });
  } catch (error) {
    console.error('Manual Save Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
