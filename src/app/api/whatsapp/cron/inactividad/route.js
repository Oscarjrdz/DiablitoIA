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

// ── Mensajes CON nombre del encargado ({nombre}) y tienda ({tienda}) ──
const ALERT_WITH_NAME = [
  "⚠️ *{nombre}*, ¿qué pasó en *{tienda}*? Llevan {min} minutos sin registrar un solo ticket. ¡Reacciona!",
  "🚨 *{nombre}*, ¿sí abrimos o estamos de vacaciones? *{tienda}* lleva {min} minutos sin vender. ¡Espabílate!",
  "⏰ Oye *{nombre}*, ¿se te durmió la caja en *{tienda}*? Ya van {min} minutos de puro silencio. ¡A chambear!",
  "👀 *{nombre}*, te estoy viendo desde el sistema... *{tienda}* lleva {min} minutos sin dar ni para el chicle.",
  "🔌 *{nombre}*, ¿les cortaron la luz en *{tienda}*? Porque {min} minutos sin actividad ya es preocupante. Repórtate.",
  "⏱️ *{nombre}*, el Diablito te está vigilando 👁️. *{tienda}* tiene {min} min de pura nada. ¡Muévete!",
  "🔔 Hey *{nombre}*, alerta máxima en *{tienda}*. Son {min} minutos inactivos. ¿Qué está pasando por allá?",
  "⏳ *{nombre}*, no te me duermas. *{tienda}* lleva {min} min sin hacer una sola venta. ¡Dale!",
  "📉 *{nombre}*, ¿estás ahí? Porque *{tienda}* trae {min} minutos de sequía total. ¡Échale ganas!",
  "⚠️ ¡Cuidado *{nombre}*! *{tienda}* ya lleva {min} minutos sin facturar. ¿La caja funciona o nah?",
  "🛒 *{nombre}*, tu caja de *{tienda}* lleva {min} minutos apagada... bueno, sin tickets. ¿Todo bien?",
  "🤔 *{nombre}*, ¿cerramos temprano en *{tienda}* o qué? Marca {min} minutos sin ninguna venta.",
  "📢 ¡*{nombre}*! {min} minutos sin tickets en *{tienda}* es demasiado tiempo perdido. ¡A vender!",
  "🛑 *{nombre}*, emergencia en *{tienda}*: {min} min sin actividad. Manda estatus ya.",
  "👻 *{nombre}*, se ven puros fantasmas en *{tienda}*... {min} minutos sin clientes. ¡Ánimo!",
  "💤 *{nombre}*, *{tienda}* entró en modo siesta. {min} minutos de ceros. ¡Despierta esa caja!",
  "🐒 *{nombre}*, ¿se escaparon los monos de *{tienda}*? {min} minutos sin ventas, ¡ponte las pilas!",
  "💀 *{nombre}*, la caja de *{tienda}* huele a muerto... {min} minutos sin sonar. ¡Revívela!",
  "🐢 *{nombre}*, ni las tortugas van tan lento como *{tienda}*. Ya son {min} minutotes sin tickets.",
  "👽 ¿Te abdujeron los ovnis, *{nombre}*? *{tienda}* lleva {min} minutos sin señales de vida.",
  "🛌 ¿Ya sacaste las cobijas en *{tienda}*, *{nombre}*? Llevan {min} minutos roncando sin clientes.",
  "🕸️ Le están saliendo telarañas a la caja de *{tienda}*, *{nombre}*. {min} minutos mudos. ¡Sacúdete!",
  "🏜️ Más movimiento hay en el desierto que en *{tienda}*, *{nombre}*. {min} min sin ventas.",
  "🧘‍♂️ Mucha meditación zen en *{tienda}*, *{nombre}*... {min} min de silencio. ¡Deja el om y vende!",
  "🕵️ Buscando a *{nombre}* en *{tienda}*... {min} minutos desaparecido del sistema. ¡Repórtate!",
  "🧊 Se congeló *{tienda}*, *{nombre}*. {min} minutotes sin vender nada. ¡A calentar esa caja!",
  "🦉 Cri cri... cri cri... *{nombre}*, grillos en *{tienda}* desde hace {min} minutos. ¡Despierta!",
  "🎪 ¿Se fue el circo de *{tienda}*, *{nombre}*? Tenemos {min} minutos de comedia sin ventas.",
  "🐌 El caracol te gana, *{nombre}*. *{tienda}* trae {min} minutos arrastrándose sin cobros.",
  "🕳️ ¿Se tragó un hoyo negro la caja de *{tienda}*, *{nombre}*? {min} minutos sin tickets.",
  "🏴‍☠️ ¿Nos robaron los clientes en *{tienda}*, *{nombre}*? {min} min con la caja vacía.",
  "🚑 Manden ambulancia a *{tienda}*... *{nombre}*, {min} minutos sin pulso en la caja.",
  "🛸 ¿Se llevaron el iPad los marcianos, *{nombre}*? *{tienda}* lleva {min} min sin tocarse.",
  "🎩 Magia negra en *{tienda}*: *{nombre}*, desaparecieron las ventas por {min} minutos.",
  "🪦 RIP turno de *{nombre}* en *{tienda}*... {min} min sin respirar. ¡Adrenalina a esa caja!",
  "🐍 *{nombre}*, hasta las serpientes venden más que *{tienda}* en estos {min} minutos. ¡Hay que reaccionar!",
  "🎰 *{nombre}*, la caja de *{tienda}* no ha sonado en {min} minutos. ¡Jala la palanca y actívate!",
  "🧨 *{nombre}*, si no explotas ventas en *{tienda}*, exploto yo. Ya van {min} minutos en ceros.",
  "🎸 *{nombre}*, el solo de guitarra de silencio en *{tienda}* ya lleva {min} minutos. ¡Ponle ritmo!",
  "🦖 *{nombre}*, se extinguieron los clientes de *{tienda}* hace {min} minutos. ¿Era el meteorito?",
  "🍳 *{nombre}*, esos huevos no se fríen solos. *{tienda}* lleva {min} min sin actividad. ¡Muévete!",
  "📻 Silencio de radio en *{tienda}*, *{nombre}*. {min} min sin transmisión. ¡Cambio y fuera!",
  "🧲 *{nombre}*, a *{tienda}* hay que ponerle un imán de clientes. Llevan {min} min repeliendo ventas.",
  "🎻 El violín más pequeño del mundo suena por *{tienda}*, *{nombre}*. {min} min sin tickets.",
  "🏗️ *{nombre}*, ¿estás construyendo algo ahí o por qué {min} min sin vender en *{tienda}*?",
  "🦥 *{nombre}*, el perezoso oficial de *{tienda}*: {min} minutos colgado sin cobrar.",
  "🧪 Experimento: ¿sobrevive *{tienda}* sin vender? *{nombre}* ya lleva {min} min probándolo.",
  "🎃 *{nombre}*, *{tienda}* da más miedo que Halloween. {min} minutos vacíos, sin un alma.",
  "🥶 Congelados en *{tienda}*, *{nombre}*. El termómetro de ventas marca 0 desde hace {min} min.",
  "🐧 Pingüinos en *{tienda}*: *{nombre}*, {min} minutos parados sin hacer nada. ¡Caminen!"
];

// ── Mensajes SIN nombre (fallback cuando no hay encargado mapeado) ──
const ALERT_GENERIC = [
  "⚠️ Equipo de *{tienda}*, ¿sí abrimos hoy? Llevan {min} minutos sin registrar un ticket. ¡Revisen!",
  "🚨 Atención *{tienda}*: {min} mins desde la última venta. ¿Se cayó el sistema? Confirmen.",
  "⏰ *{tienda}*, andamos muy silenciosos... {min} minutos sin cobrar nada. ¿Todo bien?",
  "👀 Ojo en *{tienda}*: {min} min sin tickets. ¡Hay que meterle turbo!",
  "🔌 Equipo de *{tienda}*, ¿tienen luz? Ya son {min} minutos sin movimiento en caja.",
  "⏱️ *{tienda}*, ¿seguimos operando? {min} minutos de inactividad total. ¡Despertemos!",
  "🔔 Alerta de inactividad para *{tienda}*. {min} minutos inoperantes en caja.",
  "📉 Bajón detectado en *{tienda}*: {min} min sin ingresos. ¿Qué pasó?",
  "🛒 *{tienda}* lleva {min} minutos sin sonar la caja. ¿Todo en orden?",
  "📢 Llamado a *{tienda}*: {min} minutos sin tickets es mucho tiempo muerto. ¡Ánimo!"
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // ALERTA DE INACTIVIDAD DESACTIVADA POR PETICIÓN DEL USUARIO
        return NextResponse.json({ success: true, reason: 'Inactividad notifications disabled by user request' });

        const nowMs = Date.now();
        const lockStr = await redis.get('cron_inactividad_lock');
        if (lockStr && (nowMs - parseInt(lockStr)) < 45000) {
             return NextResponse.json({ success: false, reason: 'Already executing concurrently, skipping' });
        }
        await redis.set('cron_inactividad_lock', nowMs.toString());

        // ── CORTE AUTOMÁTICO A LAS 7 AM ──
        // Si son antes de las 7:00 AM hora Monterrey, silenciar alertas de inactividad.
        // Esto protege contra encargados que olvidan sacar el corte de caja.
        const nowMty = new Date();
        const mtyHour = parseInt(nowMty.toLocaleTimeString('en-US', { timeZone: 'America/Monterrey', hour: '2-digit', hour12: false }));
        if (mtyHour >= 2 && mtyHour < 7) {
            return NextResponse.json({ success: true, reason: 'Fuera de horario operativo (2AM - 7AM MTY) – alertas de inactividad silenciadas' });
        }


        const grupoId = await redis.get('ventas_grupo_id');
        if (!grupoId || !grupoId.includes('@g.us')) {
            return NextResponse.json({ success: false, reason: 'No group configured' });
        }

        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        const loyverseToken = await redis.get('loyverse_token');
        if (!loyverseToken) return NextResponse.json({ success: false, reason: 'No loyverse token' });

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

        // ── Solo contar tickets de DESPUÉS de las 7 AM hora Monterrey ──
        // Las ventas de madrugada (1 AM, 2 AM) NO cuentan para inactividad.
        // El ciclo de alertas solo arranca con el primer ticket después de las 7 AM.
        const todayReceipts = allReceipts.filter(r => {
            if (r.cancelled_at) return false;
            const rDate = new Date(r.created_at);
            if (rDate.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }) !== mtyStr) return false;
            // Ignorar tickets de antes de las 7 AM Monterrey
            const rHour = parseInt(rDate.toLocaleTimeString('en-US', { timeZone: 'America/Monterrey', hour: '2-digit', hour12: false }));
            return rHour >= 7;
        });

        // Check for closed shifts to silence those stores
        const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
        let closedStoreIds = new Set();
        if (shiftRes.ok) {
            const shiftData = await shiftRes.json();
            if (shiftData.shifts) {
                const sortedShifts = shiftData.shifts.sort((a,b) => new Date(a.updated_at) - new Date(b.updated_at));
                for (const shift of sortedShifts) {
                    if (shift.closed_at) {
                        const closedDate = new Date(shift.closed_at).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
                        if (closedDate === mtyStr) {
                            closedStoreIds.add(shift.store_id);
                        }
                    } else {
                        closedStoreIds.delete(shift.store_id);
                    }
                }
            }
        }

        const ps = {};
        stores.forEach(s => { 
            if (s.name.toLowerCase().includes('prueba')) return;
            ps[s.id] = { id: s.id, name: s.name.trim(), t: 0, lastTime: null }; 
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
        for (const s of Object.values(ps)) {
            // Regla 2: Ignorar si no ha caído/anunciado su primer ticket del día (gatillo oficial)
            const firstTicketKey = `first_ticket_v2_${s.id}_${mtyStr}`;
            const firstTicketSent = await redis.get(firstTicketKey);
            if (firstTicketSent !== 'SENT') {
                continue;
            }

            // Regla 3: Evaluación de inactividad si no ha sido cerrada
            if (s.t > 0 && s.lastTime && !closedStoreIds.has(s.id)) {
                const diffMs = now.getTime() - s.lastTime.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins >= 30) {
                    // Determinar nivel de alerta (30, 40, 50, 60...)
                    const alertLevel = Math.floor((diffMins - 30) / 10) * 10 + 30;
                    
                    // Memoria dinámica anclada a la hora exacta de *ese* último ticket en particular
                    const idleKey = `idle_alert_${s.id}_${s.lastTime.getTime()}`;
                    const lastAlertStr = await redis.get(idleKey);
                    const lastAlertLevel = lastAlertStr ? parseInt(lastAlertStr) : 0;

                    // Si ya disparamos mensaje para esta banda de minutos (ej. 30 o superior) brincamos
                    if (lastAlertLevel >= alertLevel) {
                        continue;
                    }

                    // Registrar nueva banda para la posteridad y silenciar futuros crones
                    await redis.setex(idleKey, 86400 * 2, alertLevel.toString());

                    const manager = getManager(s.name);
                    let alertText;
                    
                    if (manager) {
                        const rndIdx = Math.floor(Math.random() * ALERT_WITH_NAME.length);
                        alertText = ALERT_WITH_NAME[rndIdx];
                        alertText = alertText.replace(/{nombre}/g, manager);
                    } else {
                        const rndIdx = Math.floor(Math.random() * ALERT_GENERIC.length);
                        alertText = ALERT_GENERIC[rndIdx];
                    }
                    
                    // Mostramos el alertLevel (30, 40) en vez del minútaje crudo (33, 44) para UX psicológica perfecta
                    alertText = alertText.replace(/{tienda}/g, s.name).replace(/{min}/g, alertLevel);
                    alerts.push(alertText);
                }
            }
        }

        if (alerts.length > 0) {
            const finalAlertStr = `🚨 *Hola grupo* 🚨\n\n🔴 *RUTINA DE INACTIVIDAD* 🔴\n\n` + alerts.join('\n\n') + `\n\n⚡ _El Diablito Intelligence_`;
            await sendWhatsApp(grupoId, finalAlertStr, cfg);
            return NextResponse.json({ success: true, alertsSent: alerts.length });
        }

        return NextResponse.json({ success: true, reason: 'All active stores within limits' });
    } catch (err) {
        console.error('Inactividad error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
