import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req) {
  const { phone } = await req.json();
  let clean = phone.replace(/\D/g, '');
  if (!clean.startsWith('52')) clean = '52' + clean;
  await redis.del(`promo_pos_${clean}`);
  await redis.del(`promo_folio_${clean}`);
  await redis.del(`client_store_${clean}`);
  return NextResponse.json({ success: true, cleared: clean });
}
