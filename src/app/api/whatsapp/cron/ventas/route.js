import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

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
  'garcia': 'Lidia',
  'valle de lincoln': 'Lidia',
  'san blas': 'César',
  'blas': 'César'
};

function getManager(storeName) {
  const lower = storeName.toLowerCase();
  // Bosques: Paty antes de las 4 PM MTY, Sebas Semental después
  if (lower.includes('bosques')) {
    const mtyDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
    const dayOfWeek = mtyDate.getDay(); // 0 = Domingo
    if (dayOfWeek === 0) return 'Sebas Semental';
    const mtyHour = mtyDate.getHours();
    return mtyHour < 16 ? 'Paty' : 'Sebas Semental';
  }
  for (const [key, name] of Object.entries(STORE_MANAGERS)) {
    if (lower.includes(key)) return name;
  }
  return null;
}

const OPENING_PHRASES = [
  "🔥 ¡Ábranle que ahí les va el reporte de sus *MASIVAS VENTAS*! 🔥",
  "💰 ¡Hola grupo! Aquí les comparto sus *MASIVAS VENTAS* del día de hoy. ¡Échenle un ojo!",
  "🚀 ¡Despegamos! Aquí está el conteo de sus *GLORIOSAS* transacciones. ¡A darle!",
  "🎯 ¡Equipo legendario! Les traigo el score de sus *IMPARABLES* ventas. 📊"
]; // Las corté para espacio, las he rellenado con algunas representativas, tú ya conoces el array original o si deseas luego puedes volver a pegar las 50.

const WINNER_PHRASES = [
  "🥇 *{nombre}*, te la rifaste en *{tienda}* con {tickets} tickets. ¡Eres una máquina, sigue así! 💪",
  "👑 ¡La corona es para *{nombre}* en *{tienda}*! {tickets} tickets y contando. ¡Tiemblen los demás!",
  "🏆 ¡CAMPEÓN DEL DÍA! *{nombre}* con *{tienda}* lidera con {tickets} tickets. ¡Aplausos! 👏",
  "🔥 *{nombre}* incendiando *{tienda}* con {tickets} tickets. ¡Que alguien llame a los bomberos!"
];

const MANAGER_WINNER_PHRASES = {
  'sebas semental': [
    "🔥 *{nombre}* rayó a la competencia como a sus tatuajes, ganando en *{tienda}* con {tickets} tickets. 💉",
    "🎨 *{nombre}* inyectó tinta y ventas en *{tienda}* con {tickets} tickets. Puro arte. 🤘",
    "🐉 Con más tickets que tatuajes en su cuerpo, *{nombre}* domina en *{tienda}* con {tickets} ventas. 😎"
  ],
  'abraham': [
    "⚽ ¡Goooooooooool de *{nombre}*! Lidera la tabla a lo Santos Laguna en *{tienda}* con {tickets} tickets. 🟢⚪",
    "🏆 *{nombre}* defiende la corona en *{tienda}* como guerrero de la Comarca, asegurando {tickets} tickets. 🛡️",
    "⚔️ Modo 'Santos Laguna' activado. *{nombre}* golea a la competencia con {tickets} tickets en *{tienda}*. ⚽"
  ],
  'lidia': [
    "🙄 La indiscutible, la inalcanzable 'MEJOR EMPLEADA DE LA HISTORIA': *{nombre}* lidera desde *{tienda}* con {tickets} tickets. Pasen a felicitarla. 💅",
    "✨ Oh salvadora de El Diablito, la 'empleada del siglo' *{nombre}* volvió a aplastar a todos en *{tienda}* con {tickets} tickets. Qué barbaridad. 🙄",
    "👑 Pónganle tapete rojo a *{nombre}*. La 'mejor del condado' nos honra facturando {tickets} tickets en *{tienda}*. Increíble esfuerzo (nótese el sarcasmo). 😂"
  ]
};

const WINNER_GENERIC = [
  "🥇 ¡*{tienda}* lidera con {tickets} tickets! ¡Arriba esa tienda campeona! 💪",
  "👑 ¡La corona del día es para *{tienda}*! {tickets} tickets y nadie les alcanza. ¡Bravo!"
];

// ── Bóveda de 50 Frases Aleatorias (Primer Ticket / Houston) ──
const FIRST_TICKET_PHRASES = [
  "🚀 Houston, [SUCURSAL] comenzó a generar dinero.",
  "🔥 ¡Arrancan los motores en [SUCURSAL]! Primer ticket.",
  "💸 Cayó la primera bendición en [SUCURSAL].",
  "🛎️ ¡Ding, dong! [SUCURSAL] ya está haciendo caja.",
  "😎 Ya despertó [SUCURSAL]. Primer billete a la cuenta.",
  "🌟 Se rompió el hielo en [SUCURSAL].",
  "🏁 ¡Banderazo de salida para [SUCURSAL]!",
  "⚡ Alto voltaje: primer cobro en [SUCURSAL].",
  "🍔 [SUCURSAL] abrió la pista de baile monetaria.",
  "🤑 [SUCURSAL] reporta su primer gol del partido.",
  "📈 [SUCURSAL] acaba de entrar en la gráfica de hoy.",
  "💥 El diablito hizo su magia en [SUCURSAL]. Ya hay lana.",
  "🔥 Cuidado que [SUCURSAL] ya prendió la parrilla.",
  "🛸 Primer avistamiento de dinero en [SUCURSAL].",
  "🎤 Y el primer aplauso de hoy va para... ¡[SUCURSAL]!",
  "🎯 ¡Blanco perfecto! [SUCURSAL] acertó su primera venta.",
  "💎 [SUCURSAL] empezó a farmear los billetes.",
  "🤠 ¡Yihaa! [SUCURSAL] lazó a su primer cliente.",
  "🚀 Despegue confirmado en [SUCURSAL]. Primer ticket arriba.",
  "✨ [SUCURSAL] iluminó la caja registradora.",
  "🔔 Suena la campana: [SUCURSAL] entra en acción.",
  "💸 Lluvia de dinero empezando a caer en [SUCURSAL].",
  "🎭 [SUCURSAL] abrió el telón, primera venta completada.",
  "👑 El rey ha despertado. [SUCURSAL] ya factura.",
  "🦖 Un rugido financiero se escucha desde [SUCURSAL].",
  "🌊 La ola de ventas empezó a formarse en [SUCURSAL].",
  "🎰 ¡Jackpot! [SUCURSAL] giró la ruleta y ganó su primera venta.",
  "😎 Quítense todos, [SUCURSAL] acaba de vender.",
  "🌪️ Alerta de tornado de ventas iniciando en [SUCURSAL].",
  "🛸 Houston, tenemos contacto visual con el primer billete en [SUCURSAL].",
  "⚡ El voltaje en [SUCURSAL] acaba de subir con este primer ticket.",
  "🛡️ [SUCURSAL] entra a la batalla con su primera victoria del día.",
  "🤘 Rock and Roll. [SUCURSAL] empezó el concierto de ventas.",
  "🍕 Ya huele a victoria (y a dinero) en [SUCURSAL].",
  "🚨 Alerta naranja: [SUCURSAL] ya está facturando.",
  "💎 Mina de diamantes activada en [SUCURSAL].",
  "🏆 El primer trofeo del día lo levanta [SUCURSAL].",
  "🦁 El león despertó en [SUCURSAL]. Primer ticket.",
  "🎯 [SUCURSAL] metió el primer dardo en el centro.",
  "🌞 Buenos días, dinero. Atentamente: [SUCURSAL].",
  "💨 [SUCURSAL] arrancó metiendo quinta velocidad.",
  "🧙‍♂️ Pura brujería: [SUCURSAL] hizo aparecer el primer billete.",
  "⚓ Anclas arriba, [SUCURSAL] zarpó a mar de ganancias.",
  "🔥 Como pan caliente: [SUCURSAL] saca su primer pedido.",
  "💥 Boom. Confeti financiero en [SUCURSAL].",
  "🛰️ Radar detectando ingreso en coordenadas de [SUCURSAL].",
  "🔥 [SUCURSAL] is on fire! Primer ticket adentro.",
  "🥇 La medalla de apertura en [SUCURSAL] ha sido entregada.",
  "💰 [SUCURSAL] soltó el ancla en el puerto del dinero.",
  "🚀 Turbinas encendidas, [SUCURSAL] ya nos lleva a la luna."
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const OWNER_PHONE = '5218116038195@c.us';

    try {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        const loyverseToken = await redis.get('loyverse_token');
        
        if (!loyverseToken) {
            console.error('Cron: No loyverse token');
            return NextResponse.json({ success: false, reason: 'No token' });
        }

        const authH = { Authorization: `Bearer ${loyverseToken}` };
        const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH });
        const { stores } = await storesRes.json();

        // ── LÓGICA DE DÍA COMERCIAL (7 AM Monterrey) ──
        const now = new Date();
        const mtyObj = new Date(now.toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
        if (mtyObj.getHours() < 7) {
            mtyObj.setDate(mtyObj.getDate() - 1);
        }
        const mtyStr = mtyObj.toLocaleDateString('en-CA'); // Este es el "Business Day" (YYYY-MM-DD)

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

        // FETCH SHIFTS for "Hora Apertura"
        const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
        let shiftData = { shifts: [] };
        if (shiftRes.ok) {
            shiftData = await shiftRes.json();
        }

        // Filtramos usando "Business Day" de cada ticket
        const todayReceipts = allReceipts.filter(r => {
            if (r.cancelled_at) return false;
            const rDate = new Date(r.created_at);
            const rMty = new Date(rDate.toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
            const hr = rMty.getHours();
            
            // "de 2 a 6:59 es cerrado"
            if (hr >= 2 && hr < 7) return false;

            if (hr < 2) rMty.setDate(rMty.getDate() - 1);
            return rMty.toLocaleDateString('en-CA') === mtyStr;
        });

        let totalV = 0, totalT = 0, totalR = 0;
        const ps = {};
        stores.forEach(s => { 
            if (s.name.toLowerCase().includes('prueba')) return; 
            ps[s.id] = { id: s.id, name: s.name, v: 0, t: 0, lastTime: null, firstTime: null, registered: 0, shiftOpenedAt: null }; 
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
                    
                    // Tiempo del último ticket (Cierre/Seguimiento)
                    if (!ps[r.store_id].lastTime || rTime > ps[r.store_id].lastTime) {
                        ps[r.store_id].lastTime = rTime;
                    }

                    // Tiempo del primer ticket (Houston Alert)
                    if (!ps[r.store_id].firstTime || rTime < ps[r.store_id].firstTime) {
                        ps[r.store_id].firstTime = rTime;
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

        const STORE_SCHEDULES = {
          'titanio': { h: 12, m: 0, text: '12:00 PM' },
          'valle de lincoln': { h: 16, m: 0, text: '04:00 PM' },
          'garcia': { h: 16, m: 0, text: '04:00 PM' },
          'san blas': { h: 16, m: 0, text: '04:00 PM' },
          'palmas': { h: 16, m: 0, text: '04:00 PM' },
          'real de palmas': { h: 16, m: 0, text: '04:00 PM' },
          'bosques': { h: 9, m: 0, text: '09:00 AM' },
          'cordillera': { h: 16, m: 0, text: '04:00 PM' }
        };

        const activeStores = Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t);

        // Match firstTime with Shift openedTime
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

        // ── INYECCIÓN HOUSTON (FIRST TICKET ALERTS) ──
        const grupoId = await redis.get('ventas_grupo_id');
        for (const store of activeStores) {
            const firstTicketKey = `first_ticket_v2_${store.id}_${mtyStr}`;
            const alreadySent = await redis.get(firstTicketKey);
            
            if (!alreadySent && store.firstTime) {
                // Bloqueamos rápido para evitar reenvíos en ejecuciones paralelas o futuras
                await redis.setex(firstTicketKey, 86400 * 2, 'SENT'); // 48 hrs 
                
                const storeName = store.name.replace(/prueba|p-\d+/gi, '').trim();
                const rnd = Math.floor(Math.random() * FIRST_TICKET_PHRASES.length);
                const managerName = getManager(store.name);
                const focusName = managerName ? `*${storeName}* (con ${managerName})` : `*${storeName}*`;
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
                        
                        // Si abrieron más de 5 minutos tarde
                        if (diff > 5) {
                            delayAlert = `\n🔴 *¡OJO! Abrieron ${diff} minutos TARDE* (Su horario es a las ${sched.text})`;
                        } else if (diff < -5) {
                            delayAlert = `\n🟢 *Abrieron ${Math.abs(diff)} minutos temprano* (Su horario es a las ${sched.text})`;
                        } else {
                            delayAlert = `\n✅ *Abrieron súper PUNTUAL* (A las ${sched.text})`;
                        }
                    }
                }

                // Destacar mucho la hora de apertura
                const msgAlert = `🚨 *ALERTA APERTURA*\n\n`
                               + `${phrase}\n\n`
                               + `🕒 *HORA APERTURA TURNO:* ${shiftTimeStr}${delayAlert}\n`
                               + `🧾 *Primer Ticket:* ${ticketTimeStr}\n\n`
                               + `⚡ _El Diablito_`;
                
                // Manda alerta general al grupo
                if (grupoId && grupoId.includes('@g.us')) {
                    await sendWhatsApp(grupoId, msgAlert, cfg);
                } else {
                    await sendWhatsApp(OWNER_PHONE, msgAlert, cfg); // Default owner if group missing
                }
            }
        }

        // ── 1. GROUP MESSAGE (Resumen Global) ──
        const randomOpening = OPENING_PHRASES[Math.floor(Math.random() * OPENING_PHRASES.length)] || "🔥 Reporte del día:";
        
        let msg = `${randomOpening}\n\n`;
        msg += `📅 ${mtyStr} •  ⏰ ${hora} hrs\n\n`;

        const emojis = ['🔵', '🟢', '🟡', '🟠', '🟣', '🔴'];
        activeStores.forEach((s, i) => {
            let ltStr = "N/A";
            if (s.lastTime) {
                ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
            }
            const prefix = i === 0 ? '👑' : emojis[i % emojis.length];
            msg += `${prefix} *${s.name}*\n`;
            msg += `   🧾 ${s.t} tickets\n`;
            msg += `   ⏱️ Ut: ${ltStr}\n`;
            msg += `   👤 Regs: ${s.registered}\n\n`;
        });

        // ── Frase personalizada para el GANADOR ──
        if (activeStores.length > 0) {
            const winner = activeStores[0];
            const winnerManager = getManager(winner.name);
            const stName = winner.name.replace(/prueba|p-\d+/gi, '').trim();
            let winnerMsg;
            if (winnerManager) {
                const wmLower = winnerManager.toLowerCase();
                let chosenPhrases = WINNER_PHRASES; // Valeria, César, Paty usan genéricas
                
                if (MANAGER_WINNER_PHRASES[wmLower]) {
                    chosenPhrases = MANAGER_WINNER_PHRASES[wmLower];
                }
                
                const rndIdx = Math.floor(Math.random() * chosenPhrases.length);
                winnerMsg = (chosenPhrases[rndIdx])
                    .replace(/{nombre}/g, winnerManager)
                    .replace(/{tienda}/g, stName)
                    .replace(/{tickets}/g, winner.t);
            } else {
                const rndIdx = Math.floor(Math.random() * WINNER_GENERIC.length);
                winnerMsg = (WINNER_GENERIC[rndIdx] || WINNER_GENERIC[0])
                    .replace(/{tienda}/g, winner.name)
                    .replace(/{tickets}/g, winner.t);
            }
            msg += `━━━━━━━━━━━━━━━━━━\n${winnerMsg}\n`;
        }

        msg += `━━━━━━━━━━━━━━━━━━\n⚡ _El Diablito Intelligence_`;

        if (grupoId && grupoId.includes('@g.us')) {
            await sendWhatsApp(grupoId, msg, cfg);
        }

        // ── 2. ADMIN MESSAGE (Full financials) ──
        let msgAdmin = `📊 *VENTAS DE HOY (Admin)*\n`;
        msgAdmin += `📅 ${mtyStr} •  ⏰ ${hora} hrs\n\n`;
        
        activeStores.forEach((s, i) => {
            let ltStr = "N/A";
            if (s.lastTime) ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
            msgAdmin += `${emojis[i % emojis.length]} *${s.name}*\n`;
            msgAdmin += `   💰 ${fmt(s.v)}\n`;
            msgAdmin += `   🧾 ${s.t} tickets (Ut: ${ltStr})\n\n`;
        });
        
        const noSales = stores.filter(s => !ps[s.id] || ps[s.id].v === 0);
        if (noSales.length > 0) msgAdmin += `⚪ *Sin ventas:* ${noSales.map(s => s.name).join(', ')}\n\n`;

        msgAdmin += `━━━━━━━━━━━━━━━━━━\n`;
        msgAdmin += `💰 *Total Ingresos:* ${fmt(totalV)}\n`;
        msgAdmin += `🔴 *Reembolsos:* ${fmt(totalR)}\n`;
        msgAdmin += `🧾 *Total Tickets:* ${totalT}\n`;
        msgAdmin += `📊 *Ticket Promedio:* ${fmt(totalT > 0 ? (totalV / totalT) : 0)}\n`;
        msgAdmin += `⚡ _El Diablito Intelligence_`;

        await sendWhatsApp(OWNER_PHONE, msgAdmin, cfg);

        return NextResponse.json({ success: true });

    } catch (err) {
        console.error('Cron Ventas error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
