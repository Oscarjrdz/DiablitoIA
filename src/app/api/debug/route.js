import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  const dWebhook = await redis.get('DEBUG_WEBHOOK_CUSTOMER');
  const dErr = await redis.get('DEBUG_WEBHOOK_ERROR');
  const promos = await redis.get('promotions');
  const wConfig = await redis.get('wapp_config');
  
  return NextResponse.json({
    dWebhook: dWebhook || null,
    dErr: dErr || null,
    wConfig: wConfig || null,
    hasPromos: !!promos
  });
}
