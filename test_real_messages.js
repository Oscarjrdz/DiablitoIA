const Redis = require('ioredis');

const rawRedis = new Redis("redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769");

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

const STORE_MANAGERS = {
  'titanio': 'Abraham',
  'palmas': 'Valeria',
  'real de palmas': 'Valeria',
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

const FIRST_TICKET_PHRASES = [
  "🚀 Houston, [SUCURSAL] comenzó a generar dinero.",
  "🔥 ¡Arrancan los motores en [SUCURSAL]! Primer ticket.",
  "💸 Cayó la primera bendición en [SUCURSAL].",
  "🛎️ ¡Ding, dong! [SUCURSAL] ya está haciendo caja.",
  "😎 Ya despertó [SUCURSAL]. Primer billete a la cuenta."
];

async function main() {
    let tokenStr = await rawRedis.get('loyverse_token');
    // Si viene con comillas, lo limpiamos, dado el helper original:
    if(tokenStr && tokenStr.startsWith('"')) tokenStr = JSON.parse(tokenStr);
    
    if (!tokenStr) {
        console.error('No loyverse token found!');
        process.exit(1);
    }
    const authH = { Authorization: `Bearer ${tokenStr}` };

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

    const palmasId = stores.find(s => s.name.toLowerCase().includes('palmas'))?.id;
    allReceipts.forEach(r => {
        if (r.store_id === palmasId && r.created_at) {
            const fix = new Date(r.created_at);
            fix.setHours(fix.getHours() + 1);
            r.created_at = fix.toISOString();
        }
    });

    const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
    let shiftData = { shifts: [] };
    if (shiftRes.ok) {
        shiftData = await shiftRes.json();
        const pId = stores.find(s => s.name.toLowerCase().includes('palmas'))?.id;
        (shiftData.shifts || []).forEach(sh => {
             if (sh.store_id === pId) {
                  if (sh.opened_at) {
                       const o = new Date(sh.opened_at);
                       o.setHours(o.getHours() + 1);
                       sh.opened_at = o.toISOString();
                  }
                  if (sh.closed_at) {
                       const c = new Date(sh.closed_at);
                       c.setHours(c.getHours() + 1);
                       sh.closed_at = c.toISOString();
                  }
             }
        });
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

    const ps = {};
    stores.forEach(s => { 
        if (s.name.toLowerCase().includes('prueba')) return; 
        ps[s.id] = { id: s.id, name: s.name, v: 0, t: 0, lastTime: null, firstTime: null, registered: 0, shiftOpenedAt: null }; 
    });

    todayReceipts.forEach(r => {
        const isRef = r.receipt_type === 'REFUND';
        if (!isRef) { 
            if (ps[r.store_id]) { 
                ps[r.store_id].t++;
                const rTime = new Date(r.created_at);
                if (!ps[r.store_id].firstTime || rTime < ps[r.store_id].firstTime) {
                    ps[r.store_id].firstTime = rTime;
                }
            } 
        }
    });

    const STORE_SCHEDULES = {
        'titanio': { h: 12, m: 0, text: '12:00 PM' },
        'valle de lincoln': { h: 16, m: 0, text: '04:00 PM' },
        'san blas': { h: 16, m: 0, text: '04:00 PM' },
        'palmas': { h: 16, m: 0, text: '04:00 PM' },
        'real de palmas': { h: 16, m: 0, text: '04:00 PM' },
        'bosques': { h: 9, m: 0, text: '09:00 AM' },
        'cordillera': { h: 16, m: 0, text: '04:00 PM' }
    };

    const activeStores = Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t);

    for (const store of activeStores) {
         if (store.firstTime && shiftData.shifts) {
             const sShifts = shiftData.shifts.filter(sh => sh.store_id === store.id && sh.opened_at);
             const validShifts = sShifts.filter(sh => new Date(sh.opened_at) <= store.firstTime);
             if (validShifts.length > 0) {
                  validShifts.sort((a,b) => new Date(b.opened_at) - new Date(a.opened_at));
                  store.shiftOpenedAt = new Date(validShifts[0].opened_at);
             } else if (sShifts.length > 0) {
                  sShifts.sort((a,b) => new Date(b.opened_at) - new Date(a.opened_at));
                  store.shiftOpenedAt = new Date(sShifts[0].opened_at);
             }
         }
    }

    console.log("=== ENVIANDO MENSAJES REALES AL GRUPO ===");

    const grupoId = await rawRedis.get('ventas_grupo_id');
    const configStr = await rawRedis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    for (const store of activeStores) {
        if (store.firstTime) {
            const storeName = store.name.replace(/prueba|p-\d+/gi, '').trim();
            const rnd = Math.floor(Math.random() * FIRST_TICKET_PHRASES.length);
            const managerName = getManager(store.name);
            const focusName = managerName ? `*${storeName} (con ${managerName})*` : `*${storeName}*`;
            const phrase = FIRST_TICKET_PHRASES[rnd].replace(/\[SUCURSAL\]/g, focusName);
            
            const ticketTimeStr = store.firstTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: true });
            let shiftTimeStr = 'Desconocida';
            let delayAlert = '';

            if (store.shiftOpenedAt) {
                shiftTimeStr = store.shiftOpenedAt.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: true });
                const lowerName = storeName.toLowerCase();
                const schedKey = Object.keys(STORE_SCHEDULES).find(k => lowerName.includes(k));
                
                if (schedKey) {
                    const sched = STORE_SCHEDULES[schedKey];
                    const sHour = parseInt(store.shiftOpenedAt.toLocaleTimeString('en-US', { timeZone: 'America/Monterrey', hour: 'numeric', hour12: false }));
                    const sMin = parseInt(store.shiftOpenedAt.toLocaleTimeString('en-US', { timeZone: 'America/Monterrey', minute: 'numeric' }));
                    
                    const actualMins = sHour * 60 + sMin;
                    const expectedMins = sched.h * 60 + sched.m;
                    const diff = actualMins - expectedMins;
                    
                    if (diff > 5) {
                        delayAlert = `\n🔴 *¡OJO! Abrieron ${diff} minutos TARDE* (Su horario es a las ${sched.text})`;
                    } else if (diff < -5) {
                        delayAlert = `\n🟢 *Abrieron ${Math.abs(diff)} minutos temprano* (Su horario es a las ${sched.text})`;
                    } else {
                        delayAlert = `\n✅ *Abrieron súper PUNTUAL* (A las ${sched.text})`;
                    }
                }
            }

            const msgAlert = `🚨 *ALERTA APERTURA*\n\n${phrase}\n\n🕒 *HORA APERTURA TURNO:* ${shiftTimeStr}${delayAlert}\n🧾 *Primer Ticket:* ${ticketTimeStr}\n\n⚡ _El Diablito_`;
            console.log("SIMULADO (DESACTIVADO POR PETICIÓN):", msgAlert);
            // ALERTA DESACTIVADA A PETICIÓN DEL USUARIO
            // if (grupoId && cfg.wappToken) {
            //     await sendWhatsApp(grupoId.replace(/"/g, ''), msgAlert, cfg);
            // }
        }
    }
    console.log("Completado.");
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
