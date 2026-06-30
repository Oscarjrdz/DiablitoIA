import { redis } from '@/lib/redis';
import { CHAT_EVENTS_CHANNEL } from '@/lib/realtime';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
            };

            send({ type: 'connected' });

            let closed = false;
            let unsubscribe = null;
            const heartbeat = setInterval(() => {
                if (closed) return;
                try { controller.enqueue(encoder.encode(': keepalive\n\n')); } catch {}
            }, 20000);

            const close = async () => {
                if (closed) return;
                closed = true;
                clearInterval(heartbeat);
                try { await unsubscribe?.(); } catch {}
                try { controller.close(); } catch {}
            };

            req.signal.addEventListener('abort', close, { once: true });

            try {
                unsubscribe = await redis.subscribe(CHAT_EVENTS_CHANNEL, (event) => {
                    if (closed) return;
                    const data = typeof event === 'string' ? { type: 'chat:update', raw: event } : event;
                    send(data);
                });
            } catch (e) {
                send({ type: 'sse:error', error: e.message });
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
