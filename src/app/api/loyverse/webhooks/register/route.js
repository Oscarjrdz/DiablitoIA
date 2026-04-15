import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });

    const body = await req.json();

    const headers = { 
      'Authorization': token,
      'Content-Type': 'application/json'
    };
    
    const res = await fetch('https://api.loyverse.com/v1.0/webhooks', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: body.action || "customers.update",
        url: body.url || "https://global-sales-prediction.vercel.app/api/loyverse/webhook",
        status: "ENABLED"
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error registering webhook:', error);
    return NextResponse.json({ error: 'Failed to register webhook' }, { status: 500 });
  }
}
