import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const logs = await redis.lrange('redeemed_coupons_log', 0, 500);
    const parsedLogs = logs.map(l => typeof l === 'string' ? JSON.parse(l) : l);
    // Sort by newest first
    parsedLogs.sort((a, b) => new Date(b.receiptDate || 0) - new Date(a.receiptDate || 0));
    return NextResponse.json({ success: true, data: parsedLogs });
  } catch (error) {
    console.error('Error fetching redemptions:', error);
    return NextResponse.json({ error: 'Failed to fetch redemptions' }, { status: 500 });
  }
}
