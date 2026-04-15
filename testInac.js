const { createClient } = require('redis');

async function test() {
    const redis = createClient({ url: 'redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769' });
    await redis.connect();
    const lToken = await redis.get('loyverse_token');
    
    const authH = { Authorization: `Bearer ${lToken}` };
    const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH });
    const { stores } = await storesRes.json();

    const now = new Date();
    const mtyStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
    const [ty, tm, td] = mtyStr.split('-').map(Number);
    const fetchStart = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0)).toISOString();
    const fetchEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0)).toISOString();

    const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
    let closedStoreIds = new Set();
    if (shiftRes.ok) {
        const shiftData = await shiftRes.json();
        if (shiftData.shifts) {
            const sortedShifts = shiftData.shifts.sort((a,b) => new Date(a.updated_at) - new Date(b.updated_at));
            for (const shift of sortedShifts) {
                if (shift.closed_at) closedStoreIds.add(shift.store_id);
                else closedStoreIds.delete(shift.store_id);
            }
        }
    }

    let allReceipts = [], cur = null, more = true;
    while (more) {
        let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${fetchStart}&created_at_max=${fetchEnd}&limit=250`;
        if (cur) url += `&cursor=${cur}`;
        const rr = await fetch(url, { headers: authH });
        const rd = await rr.json();
        if (rd.receipts?.length) allReceipts = allReceipts.concat(rd.receipts);
        cur = rd.cursor || null;
        more = !!cur;
    }

    const todayReceipts = allReceipts.filter(r => {
        if (r.cancelled_at) return false;
        return new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }) === mtyStr;
    });

    const ps = {};
    stores.forEach(s => { 
        if (s.name.toLowerCase().includes('prueba')) return;
        ps[s.id] = { id: s.id, name: s.name.trim(), t: 0, lastTime: null, closed: closedStoreIds.has(s.id) }; 
    });

    todayReceipts.forEach(r => {
        const isRef = r.receipt_type === 'REFUND';
        if (!isRef && ps[r.store_id]) { 
            ps[r.store_id].t++;
            const rTime = new Date(r.created_at);
            if (!ps[r.store_id].lastTime || rTime > ps[r.store_id].lastTime) {
                ps[r.store_id].lastTime = rTime;
            }
        }
    });

    let alerts = [];
    Object.values(ps).forEach(s => {
        let diffMins = 0;
        if (s.t > 0 && s.lastTime && !s.closed) {
            const diffMs = now.getTime() - s.lastTime.getTime();
            diffMins = Math.floor(diffMs / 60000);
            if (diffMins >= 30) {
                alerts.push(`[ALERT ${diffMins}m] ${s.name}`);
            }
        }
        console.log(`Store: ${s.name} | Tickets: ${s.t} | LastTime: ${s.lastTime ? new Date(s.lastTime).toLocaleString('es-MX', {timeZone: 'America/Monterrey'}) : 'N/A'} | Closed: ${s.closed} | InacMins: ${diffMins}`);
    });

    console.log('\nFinal Alerts:', alerts);
    process.exit(0);
}
test().catch(console.error);
