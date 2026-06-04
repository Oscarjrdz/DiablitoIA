import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const [ackLogs, lastSend, lastPayload, lastImagePayload, unknownEvent, fromMeDropped, lastMsgReceived] = await Promise.all([
      redis.lrange('debug_ack_log', 0, 29),
      redis.get('debug_last_send_response'),
      redis.get('DEBUG_LAST_PAYLOAD'),
      redis.get('DEBUG_LAST_IMAGE_PAYLOAD'),
      redis.get('DEBUG_UNKNOWN_EVENT'),
      redis.get('DEBUG_FROMME_DROPPED'),
      redis.get('DEBUG_LAST_MSG_RECEIVED')
    ]);

    const parsedAck = ackLogs.map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return l; } });
    const parsedSend = lastSend ? (typeof lastSend === 'string' ? JSON.parse(lastSend) : lastSend) : null;

    return NextResponse.json({
      success: true,
      ackEvents: parsedAck,
      lastSendResponse: parsedSend,
      lastWebhookPayload: lastPayload,
      lastImagePayload,
      unknownEvent,
      fromMeDropped
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
