import { redis } from './redis';

export const CHAT_EVENTS_CHANNEL = 'chat_events';

export async function publishChatEvent(event = {}) {
  const payload = { ts: Date.now(), type: 'chat:update', ...event };
  await Promise.allSettled([
    redis.publish?.(CHAT_EVENTS_CHANNEL, payload),
    redis.set?.('sse_notify_last', payload),
  ]);
}
