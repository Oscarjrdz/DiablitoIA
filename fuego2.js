const Redis = require('ioredis');

const redis = new Redis('redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769');

async function sendWhatsApp(to, body, cfg) {
  // Using native Node fetch
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

(async () => {
    try {
        console.log('Fetching configs from Redis...');
        let cfgStr = await redis.get('wapp_config');
        const cfg = typeof cfgStr === 'string' ? JSON.parse(cfgStr) : (cfgStr || {});
        let loyverseToken = await redis.get('loyverse_token');
        if (!loyverseToken) throw new Error("No token");
        
        console.log('Fetching Loyverse data...');
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

        let msg = `👋🏼 Hola grupo les comparto esto:\n\n⏰ *CORTE AUTOMÁTICO*\n👥 *REPORTE GRUPAL*\n📅 ${mtyStr} •  ⏰ ${hora} hrs\n\n`;

        const emojis = ['🔵', '🟢', '🟡', '🟠', '🟣', '🔴'];
        Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t).forEach((s, i) => {
            let ltStr = "N/A";
            if (s.lastTime) ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
            msg += `${emojis[i % emojis.length]} *${s.name}*\n   🧾 ${s.t} tickets\n   ⏱️ Ut: ${ltStr}\n\n`;
        });
        msg += `━━━━━━━━━━━━━━━━━━\n⚡ _El Diablito Intelligence_`;

        let grupoId = await redis.get('ventas_grupo_id');
        if (grupoId && grupoId.includes('@g.us')) {
            console.log('Disparando al grupo:', grupoId);
            await sendWhatsApp(grupoId, msg, cfg);
        } else {
            console.log('No se encontro grupo en Redis.');
        }

        let msgAdmin = `📊 *VENTAS DE HOY (Admin)*\n📅 ${mtyStr} •  ⏰ ${hora} hrs\n\n`;
        Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t).forEach((s, i) => {
            let ltStr = "N/A";
            if (s.lastTime) ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
            msgAdmin += `${emojis[i % emojis.length]} *${s.name}*\n   💰 $${s.v.toFixed(2)}\n   🧾 ${s.t} tickets (Ut: ${ltStr})\n\n`;
        });
        const noSales = stores.filter(s => !ps[s.id] || ps[s.id].v === 0);
        if (noSales.length > 0) msgAdmin += `⚪ *Sin ventas:* ${noSales.map(s => s.name).join(', ')}\n\n`;
        msgAdmin += `━━━━━━━━━━━━━━━━━━\n💵 *Total Ingresos:* $${totalV.toFixed(2)}\n🔄 *Reembolsos:* $${totalR.toFixed(2)}\n⚡ _El Diablito Intelligence_`;

        console.log('Disparando al celular personal del admin (8116038195)...');
        await sendWhatsApp('5218116038195@c.us', msgAdmin, cfg);

        console.log('Cron manual exitoso. Limpiando cache local...');
        redis.quit();
        process.exit(0);
    } catch(e) {
        console.error('Error in script:', e);
        process.exit(1);
    }
})();
