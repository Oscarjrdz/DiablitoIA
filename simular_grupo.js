const Redis = require('ioredis');
const rawRedis = new Redis("redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769");

const STORE_MANAGERS = {
  'titanio': 'Abraham',
  'palmas': 'Valeria',
  'real de palmas': 'Valeria',
  'garcia': 'Lidia',
  'valle de lincoln': 'Lidia',
  'san blas': 'César',
  'blas': 'César'
};

function getManager(storeName) {
  const lower = storeName.toLowerCase();
  if (lower.includes('bosques')) {
    const mtyDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
    const dayOfWeek = mtyDate.getDay();
    if (dayOfWeek === 0) return 'Sebas Semental';
    const mtyHour = mtyDate.getHours();
    return mtyHour < 16 ? 'Paty' : 'Sebas Semental';
  }
  for (const [key, name] of Object.entries(STORE_MANAGERS)) {
    if (lower.includes(key)) return name;
  }
  return null;
}

const OPENING_PHRASES = ["🔥 ¡Ábranle que ahí les va el reporte de sus *MASIVAS VENTAS*! 🔥"];
const STORE_ONLY_PHRASES = ["🛒 *{tienda}* sumando y sumando al contador global."];
const GENERIC_PHRASES = ["💪 ¡Vamos banda! *{nombre}* aportando todo el poder a *{tienda}*."];
const MANAGER_PHRASES = {
  'sebas semental': ["🔥 *{nombre}* rayando a la competencia como a sus tatuajes en *{tienda}*."],
  'abraham': ["⚽ ¡Modo ataque de *{nombre}*! Sudando la camiseta a lo Santos Laguna en *{tienda}*."],
  'lidia': ["🙄 La indiscutible 'MEJOR EMPLEADA DE LA HISTORIA': *{nombre}* sigue facturando en *{tienda}*. Pasen a felicitarla."]
};

async function main() {
    let loyverseToken = await rawRedis.get('loyverse_token');
    if(loyverseToken && loyverseToken.startsWith('"')) loyverseToken = JSON.parse(loyverseToken);

    if (!loyverseToken) {
        console.error('No loyverse token');
        process.exit(1);
    }

    const authH = { Authorization: `Bearer ${loyverseToken}` };
    const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH });
    const { stores } = await storesRes.json();

    const now = new Date();
    const mtyObj = new Date(now.toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
    if (mtyObj.getHours() < 7) {
        mtyObj.setDate(mtyObj.getDate() - 1);
    }
    const mtyStr = mtyObj.toLocaleDateString('en-CA');

    const [ty, tm, td] = mtyStr.split('-').map(Number);
    const fetchStart = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0)).toISOString();
    const fetchEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0)).toISOString();

    let allReceipts = [], cur = null, more = true;
    while (more) {
        let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=250`;
        if (cur) url += `&cursor=${cur}`;
        const rr = await fetch(url, { headers: authH });
        const rd = await rr.json();
        if (rd.receipts?.length) allReceipts = allReceipts.concat(rd.receipts);
        cur = rd.cursor || null;
        more = !!cur;
    }

    const todayReceipts = allReceipts.filter(r => {
        if (r.cancelled_at) return false;
        const rDate = new Date(r.created_at);
        const rMty = new Date(rDate.toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
        const hr = rMty.getHours();
        if (hr >= 2 && hr < 7) return false;
        if (hr < 2) rMty.setDate(rMty.getDate() - 1);
        return rMty.toLocaleDateString('en-CA') === mtyStr;
    });

    let totalV = 0, totalT = 0, totalR = 0;
    const ps = {};
    stores.forEach(s => { 
        if (s.name.toLowerCase().includes('prueba')) return; 
        ps[s.id] = { id: s.id, name: s.name, v: 0, t: 0, lastTime: null, registered: 0 }; 
    });

    todayReceipts.forEach(r => {
        const isRef = r.receipt_type === 'REFUND';
        const v = Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0);
        if (isRef) { 
            totalR += Math.abs(r.total_money || 0); 
        } else { 
            totalV += v; 
            totalT++; 
            if (ps[r.store_id]) { 
                ps[r.store_id].v += v; 
                ps[r.store_id].t++;
                const rTime = new Date(r.created_at);
                if (!ps[r.store_id].lastTime || rTime > ps[r.store_id].lastTime) {
                    ps[r.store_id].lastTime = rTime;
                }
            } 
        }
    });

    // ---- EXTRAER REGISTRADOS HOY ----
    let allCustomers = [], cusCur = null, hasMoreCus = true;
    try {
        while (hasMoreCus) {
            let cUrl = `https://api.loyverse.com/v1.0/customers?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=250`;
            if (cusCur) cUrl += `&cursor=${cusCur}`;
            const cr = await fetch(cUrl, { headers: authH });
            const cd = await cr.json();
            if (cd.customers?.length) allCustomers = allCustomers.concat(cd.customers);
            cusCur = cd.cursor || null;
            hasMoreCus = !!cusCur;
        }
    } catch(ce) { console.error('Error fetching cust:', ce); }

    const todayCustomers = allCustomers.filter(c => {
        const cDate = new Date(c.created_at);
        const cMty = new Date(cDate.toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
        if (cMty.getHours() < 7) cMty.setDate(cMty.getDate() - 1);
        return cMty.toLocaleDateString('en-CA') === mtyStr;
    });

    let botRegs = 0;
    todayCustomers.forEach(c => {
            let storeMatch = null;
            if (c.note && c.note.includes('Tienda:')) {
                const match = c.note.match(/Tienda:\s*([^\n\r]+)/);
                if (match) storeMatch = match[1].trim().toLowerCase();
            }
            if (storeMatch === 'whatsapp' || (c.note && c.note.includes('WhatsApp Bot'))) {
                botRegs++;
                return;
            }
            if (storeMatch) {
                const st = Object.values(ps).find(p => p.name.toLowerCase().includes(storeMatch) || storeMatch.includes(p.name.toLowerCase()));
                if (st) { st.registered++; return; }
            }
            
            const theirReceipt = todayReceipts.find(r => r.customer_id === c.id);
            if (theirReceipt && ps[theirReceipt.store_id]) {
                ps[theirReceipt.store_id].registered++;
            }
    });
    
    const hora = now.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });
    const fmt = n => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const activeStores = Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t);

    const randomOpening = OPENING_PHRASES[0];
    let msg = `${randomOpening}\n\n`;
    const dispDateRaw = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Monterrey', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const displayDate = 'Hoy ' + dispDateRaw.charAt(0).toUpperCase() + dispDateRaw.slice(1).replace(',', '');
    msg += `📅 ${displayDate} •  ⏰ ${hora} hrs\n\n`;

    const emojis = ['🥇', '🥈', '🥉', '🏅', '🎖️', '🟢', '🟡'];
    activeStores.forEach((s, i) => {
        let ltStr = "N/A";
        if (s.lastTime) {
            ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
        }
        const prefix = emojis[i] || '🔸';
        const stName = s.name.replace(/prueba|p-\d+/gi, '').trim();
        const sManager = getManager(s.name);
        
        let customComment = '';
        if (sManager) {
            const wmLower = sManager.toLowerCase();
            let arr = GENERIC_PHRASES;
            if (MANAGER_PHRASES[wmLower]) arr = MANAGER_PHRASES[wmLower];
            const rnd = Math.floor(Math.random() * arr.length);
            customComment = arr[rnd].replace(/{nombre}/g, sManager).replace(/{tienda}/g, stName);
        } else {
            const rnd = Math.floor(Math.random() * STORE_ONLY_PHRASES.length);
            customComment = STORE_ONLY_PHRASES[rnd].replace(/{tienda}/g, stName);
        }

        msg += `✨ ${customComment}\n`;
        msg += `${prefix} *${stName}*\n`;
        msg += `   🧾 ${s.t} tickets\n`;
        msg += `   ⏱️ Ut: ${ltStr}\n`;
        msg += `   👤 Clientes reg.: ${s.registered}\n\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━\n⚡ _El Diablito Intelligence_`;

    console.log("=== MENSAJE PARA EL GRUPO ===\n");
    console.log(msg);

    console.log("\n\n=== MENSAJE PARA TI (ADMIN) ===\n");
    let msgAdmin = `📊 *VENTAS DE HOY (Admin)*\n`;
    const dispDateRawAdm = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Monterrey', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    const displayDateAdm = 'Hoy ' + dispDateRawAdm.charAt(0).toUpperCase() + dispDateRawAdm.slice(1).replace(',', '');
    msgAdmin += `📅 ${displayDateAdm} •  ⏰ ${hora} hrs\n\n`;
    
    activeStores.forEach((s, i) => {
        let ltStr = "N/A";
        if (s.lastTime) ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
        msgAdmin += `${emojis[i % emojis.length]} *${s.name}*\n`;
        msgAdmin += `   💰 ${fmt(s.v)}\n`;
        msgAdmin += `   🧾 ${s.t} tickets (Ut: ${ltStr})\n`;
        msgAdmin += `   👤 Clientes reg.: ${s.registered}\n\n`;
    });
    
    const noSales = stores.filter(s => !ps[s.id] || ps[s.id].v === 0);
    if (noSales.length > 0) msgAdmin += `⚪ *Sin ventas:* ${noSales.map(s => s.name).join(', ')}\n\n`;

    msgAdmin += `━━━━━━━━━━━━━━━━━━\n`;
    msgAdmin += `💰 *Total Ingresos:* ${fmt(totalV)}\n`;
    msgAdmin += `🔴 *Reembolsos:* ${fmt(totalR)}\n`;
    msgAdmin += `🧾 *Total Tickets:* ${totalT}\n`;
    msgAdmin += `📊 *Ticket Promedio:* ${fmt(totalT > 0 ? (totalV / totalT) : 0)}\n`;
    if (botRegs > 0) msgAdmin += `🤖 *Registros Bot:* ${botRegs}\n`;
    msgAdmin += `⚡ _El Diablito Intelligence_`;

    console.log(msgAdmin);
    process.exit(0);
}

main().catch(e => console.error(e));
