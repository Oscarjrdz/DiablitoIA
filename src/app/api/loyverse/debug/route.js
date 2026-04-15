import { NextResponse } from 'next/server';

export async function GET(req) {
  const token = req.headers.get('Authorization') || req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'No token' }, { status: 401 });

  // Ensure it doesn't just pull "Bearer null"
  const actualToken = token.replace('Bearer ', '');
  if (!actualToken || actualToken === 'null') return NextResponse.json({ error: 'Invalid token format' }, { status: 401 });

  try {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const start = d.toISOString();
    
    console.log('Fetching receipts starting from', start);
    
    // Fetch directly from Loyverse
    const res = await fetch(`https://api.loyverse.com/v1.0/receipts?created_at_min=${start}&limit=250`, {
      headers: { 'Authorization': `Bearer ${actualToken}` }
    });
    
    if (!res.ok) {
        return NextResponse.json({ error: 'Loyverse API error', status: res.status });
    }
    const data = await res.json();
    
    const matchedModifiers = [];
    const matchedItems = [];
    
    for (const r of data.receipts || []) {
      for (const item of r.line_items || []) {
        const itemName = (item.item_name || '').toLowerCase();
        
        if (itemName.includes('cris') || itemName.includes('gajo') || itemName.includes('papa')) {
            matchedItems.push({
              item_name: item.item_name,
              quantity: item.quantity,
              total_money: item.total_money,
              modifiers: item.modifiers
            });
        }
        
        if (item.modifiers) {
            for (const mod of item.modifiers) {
                const modName = (mod.name || '').toLowerCase();
                if (modName.includes('cris') || modName.includes('gajo') || modName.includes('papa')) {
                    matchedModifiers.push({ 
                       modName: mod.name,
                       price: mod.price,
                       money_amount: mod.money_amount,
                       parentItem: item.item_name 
                    });
                }
            }
        }
      }
    }

    return NextResponse.json({
      matchesFound: matchedModifiers.length + matchedItems.length,
      sampleModifiers: matchedModifiers.slice(0, 50),
      sampleItems: matchedItems.slice(0, 50)
    });
  } catch (e) {
    return NextResponse.json({ error: e.message });
  }
}
