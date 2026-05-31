import { redis } from '@/lib/redis';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch {}
            };

            send({ type: 'connected' });

            let lastTs = 0;
            let keepaliveTick = 0;

            while (!req.signal.aborted) {
                try {
                    const raw = await redis.get('sse_notify');
                    if (raw) {
                        const notify = typeof raw === 'string' ? JSON.parse(raw) : raw;
                        if (notify.ts > lastTs) {
                            lastTs = notify.ts;
                            send({ type: 'update', phone: notify.phone });
                        }
                    }
                    // Keepalive every 20s to prevent proxy/CDN closing idle connection
                    if (++keepaliveTick >= 40) {
                        controller.enqueue(encoder.encode(': keepalive\n\n'));
                        keepaliveTick = 0;
                    }
                } catch { break; }

                await new Promise(r => setTimeout(r, 500));
            }

            try { controller.close(); } catch {}
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
