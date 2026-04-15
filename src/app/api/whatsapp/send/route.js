import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req) {
  try {
    const { to, text, attachment, attachmentType } = await req.json();
    if (!to) return NextResponse.json({ success: false });
    
    let cleanTo = to.replace(/\D/g, '');
    if (!cleanTo.startsWith('52')) cleanTo = '52' + cleanTo;
    
    const configStr = await redis.get('wapp_config');
    const wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    
    if (!wConfig.wappInstance || !wConfig.wappToken) return NextResponse.json({ success: false, error: 'No config' });

    // Add to redis history
    let history = await redis.get(`chat_hist_${cleanTo}@c.us`) || await redis.get(`chat_hist_${cleanTo}`);
    let parsed = typeof history === 'string' ? JSON.parse(history) : (history || []);
    let histEntry = { text: text || '' };
    if (attachment) { histEntry.attachmentType = attachmentType; histEntry.hasAttachment = true; }
    
    parsed.push({ role: 'model', parts: [histEntry] });
    await redis.set(`chat_hist_${cleanTo}@c.us`, JSON.stringify(parsed));
    await redis.set(`chat_hist_${cleanTo}`, JSON.stringify(parsed));

    const baseUrl = `https://gatewaywapp-production.up.railway.app/${wConfig.wappInstance}`;
    
    let endpoint = '/messages/chat';
    let body = { token: wConfig.wappToken, to: `${cleanTo}@c.us`, body: text };

    if (attachment && attachmentType === 'image') {
       endpoint = '/messages/image';
       body = { token: wConfig.wappToken, to: `${cleanTo}@c.us`, image: attachment, caption: text };
    } else if (attachment && attachmentType === 'audio') {
       endpoint = '/messages/audio';
       body = { token: wConfig.wappToken, to: `${cleanTo}@c.us`, audio: attachment };
    } else if (attachment && attachmentType === 'document') {
       endpoint = '/messages/document';
       body = { token: wConfig.wappToken, to: `${cleanTo}@c.us`, document: attachment, mimetype: 'application/pdf', fileName: 'Documento.pdf', caption: text };
    }

    const raw = await fetch(baseUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    
    if (!raw.ok) {
       console.error("Wapp Gateway Error", await raw.text());
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Send message error:', e);
    return NextResponse.json({ success: false });
  }
}
