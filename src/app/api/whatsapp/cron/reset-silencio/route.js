import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// Corre a medianoche hora Monterrey (UTC-6) = 06:00 UTC
// Elimina el silencio manual del bot en TODOS los chats del día anterior
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const keys = await redis.keys('delivery_bot_silence_*');

    if (!keys || keys.length === 0) {
      return NextResponse.json({ success: true, reset: 0, message: 'No había chats silenciados' });
    }

    await Promise.all(keys.map(key => redis.del(key)));

    console.log(`[reset-silencio] ${keys.length} chats reactivados al inicio del día`);
    return NextResponse.json({ success: true, reset: keys.length });

  } catch (e) {
    console.error('[reset-silencio] Error:', e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
