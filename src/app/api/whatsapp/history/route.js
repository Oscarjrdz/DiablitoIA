import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let phone = searchParams.get('phone');
  if (!phone) return NextResponse.json({ success: false });
  
  phone = phone.replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;

  try {
     const histData = await redis.get(`chat_hist_${phone}@c.us`) || await redis.get(`chat_hist_${phone}`);
     const parsed = typeof histData === 'string' ? JSON.parse(histData) : (histData || []);
     
     // El motor usa roles 'user' y 'model'. Lo convertimos a formato visual wapp:
     const messages = parsed.map(m => {
        return {
           text: m.parts?.[0]?.text || '',
           attachment: m.parts?.[0]?.attachment || null,
           attachmentType: m.parts?.[0]?.attachmentType || null,
           fromMe: m.role === 'model',
           time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
     });
     
     return NextResponse.json({ success: true, messages });
  } catch (e) {
     return NextResponse.json({ success: false });
  }
}
