import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// GET /api/didi/logs → ver los últimos payloads que mandó Didi
export async function GET() {
  try {
    const [orders, verify] = await Promise.all([
      redis.lrange('didi_orders_log', 0, 19),
      redis.get('didi_verify_request')
    ]);

    const parsed = (orders || []).map(entry => {
      try { return JSON.parse(entry); } catch { return { raw: entry }; }
    });

    return NextResponse.json({
      success: true,
      verify_request: verify ? (typeof verify === 'string' ? JSON.parse(verify) : verify) : null,
      orders: parsed,
      count: parsed.length
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// DELETE /api/didi/logs → limpiar logs
export async function DELETE() {
  await redis.del('didi_orders_log');
  await redis.del('didi_verify_request');
  return NextResponse.json({ success: true });
}
