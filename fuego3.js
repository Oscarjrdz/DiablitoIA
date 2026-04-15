const Redis = require('ioredis');

const redis = new Redis('redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769');

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

(async () => {
    try {
        let cfgStr = await redis.get('wapp_config');
        const cfg = typeof cfgStr === 'string' ? JSON.parse(cfgStr) : (cfgStr || {});
        let loyverseToken = await redis.get('loyverse_token');
        
        const authH = { Authorization: `Bearer ${loyverseToken}` };
        const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH });
        const { stores } = await storesRes.json();

        const now = new Date();
        const mtyStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
        const [ty, tm, td] = mtyStr.split('-').map(Number);
        const fetchStart = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0)).toISOString();
        const fetchEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0)).toISOString();

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

        let totalV = 0, totalT = 0, totalR = 0;
        const ps = {};
        stores.forEach(s => { ps[s.id] = { name: s.name, v: 0, t: 0, lastTime: null }; });

        todayReceipts.forEach(r => {
            const isRef = r.receipt_type === 'REFUND';
            const v = Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0);
            if (isRef) { totalR += Math.abs(r.total_money || 0); } else { 
                totalV += v; totalT++; 
                if (ps[r.store_id]) { 
                    ps[r.store_id].v += v; ps[r.store_id].t++;
                    const rTime = new Date(r.created_at);
                    if (!ps[r.store_id].lastTime || rTime > ps[r.store_id].lastTime) ps[r.store_id].lastTime = rTime;
                } 
            }
        });

        const hora = now.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });

        let msgAdmin = `📊 *VENTAS DE HOY (Admin)*\n📅 ${mtyStr} •  ⏰ ${hora} hrs\n\n`;
        const emojis = ['🔵', '🟢', '🟡', '🟠', '🟣', '🔴'];
        Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t).forEach((s, i) => {
            let ltStr = "N/A";
            if (s.lastTime) ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
            msgAdmin += `${emojis[i % emojis.length]} *${s.name}*\n   💰 $${s.v.toFixed(2)}\n   🧾 ${s.t} tickets (Ut: ${ltStr})\n\n`;
        });
        const noSales = stores.filter(s => !ps[s.id] || ps[s.id].v === 0);
        if (noSales.length > 0) msgAdmin += `⚪ *Sin ventas:* ${noSales.map(s => s.name).join(', ')}\n\n`;
        msgAdmin += `━━━━━━━━━━━━━━━━━━\n`;
        msgAdmin += `💵 *Total Ingresos:* $${totalV.toFixed(2)}\n`;
        msgAdmin += `🔄 *Reembolsos:* $${totalR.toFixed(2)}\n`;
        msgAdmin += `🧾 *Total Tickets:* ${totalT}\n`;
        msgAdmin += `📊 *Ticket Promedio:* $${(totalT > 0 ? (totalV / totalT) : 0).toFixed(2)}\n`;
        msgAdmin += `⚡ _El Diablito Intelligence_`;

        await sendWhatsApp('5218116038195@c.us', msgAdmin, cfg);
        console.log('Enviado a admin personal.');
        process.exit(0);
    } catch(e) { console.error(e); process.exit(1); }
})();
