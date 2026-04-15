import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

const ALERT_MESSAGES = [
  "⚠️ Equipo de {tienda}, ¿sí abrimos hoy? Llevamos ya {min} minutos sin registrar un solo ticket. ¡Revisen qué pasa!",
  "🚨 Atención {tienda}: Han pasado {min} mins desde la última venta. ¿Se cayó el sistema o está vacío? Confirmen.",
  "⏰ {tienda}, andamos muy silenciosos... {min} minutos sin cobrar nada. ¿Todo bien por allá?",
  "👀 Ojo en {tienda}: el reloj sigue corriendo y ya van {min} min sin tickets. ¡Hay que meterle turbo!",
  "🔌 ¿Equipo de {tienda}, tienen luz o sistema? Ya son {min} minutos sin ver movimiento en caja. Repórtense.",
  "⏱️ {tienda}, ¿seguimos operando? El sistema marca {min} minutos de inactividad total. ¡Despertemos!",
  "🔔 Alerta de inactividad para {tienda}. Llevamos {min} minutos inoperantes en caja. ¿Qué está pasando?",
  "⏳ {tienda}, no se me duerman. Hace {min} min que no cae un ticket. Repórtense con el estatus del local.",
  "📉 Bajón detectado en {tienda}: llevamos {min} min sin ingresos. ¿Mucha fila y no estamos cobrando?",
  "⚠️ ¡Cuidado {tienda}! Llegamos a {min} minutos sin facturar. ¿Seguros que la caja funciona bien?",
  "🛒 Equipo de {tienda}, el punto de venta lleva {min} minutos apagado... bueno, sin tickets. ¿Todo en orden?",
  "🤔 {tienda}, ¿cerramos temprano o qué onda? Marca {min} minutos sin ninguna venta cobrada.",
  "📢 Llamado a {tienda}: {min} minutos sin sacar tickets es muchísimo tiempo muerto. ¡Aceleren el ritmo!",
  "🛑 Emergencia en caja de {tienda}: pasaron {min} min y no se ve actividad. Favor de mandar estatus.",
  "👻 Se ven fantasmas en {tienda}... {min} minutos sin clientes cobrados. ¡Ánimo equipo, a vender!",
  "💤 {tienda} entró en modo suspenso. Llevamos {min} minutos de ceros absolutos. ¡A reactivarse!",
  "🔔 {tienda}, el monitor de ventas está trabado o de plano llevan {min} min sin ventas. Avisen novedades.",
  "👀 Monitoreo de seguridad: {tienda} cumple {min} mins con 0 tickets. Confirmar que estemos operando normal.",
  "🚨 {tienda}: ¡Foco rojo! {min} minutos exactos sin transacciones. ¿Tenemos algún freno operativo?",
  "🔥 ¡Pilas {tienda}! Ya pasaron {min} minutos desde el último cobro. ¡A capturar todas las ventas de la fila!"
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
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

        // Check for Recently Closed Shifts
        try {
            const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
            if (shiftRes.ok) {
                const shiftData = await shiftRes.json();
                if (shiftData.shifts) {
                    for (const shift of shiftData.shifts) {
                        if (shift.closed_at) {
                            const closedTime = new Date(shift.closed_at);
                            const diffMinsClosure = (now.getTime() - closedTime.getTime()) / 60000;
                            // Check if closed within the last 15 minutes (to allow for slight cron drift)
                            if (diffMinsClosure >= 0 && diffMinsClosure <= 15) {
                                // Find store name
                                const sObj = stores.find(s => s.id === shift.store_id);
                                const sName = sObj ? sObj.name : 'Desconocida';
                                
                                const fmt = n => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
                                const msgCierre = `🔔 *Oscar, la tienda ${sName} acaba de cerrar el turno.* \n\n` + 
                                                  `💰 Caja Final: ${fmt(shift.actual_cash)}\n` + 
                                                  `💵 Ventas Netas: ${fmt(shift.net_sales)}\n` +
                                                  `⚡ _El Diablito Intelligence_`;

                                await sendWhatsApp('5218116038195@c.us', msgCierre, cfg);
                            }
                        }
                    }
                }
            }
        } catch(shiftErr) {
            console.error('Shift fetch err:', shiftErr);
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
        stores.forEach(s => { ps[s.id] = { name: s.name, t: 0, lastTime: null }; });

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
            if (s.t > 0 && s.lastTime) {
                const diffMs = now.getTime() - s.lastTime.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins >= 30) {
                    const rndIdx = Math.floor(Math.random() * ALERT_MESSAGES.length);
                    let alertText = ALERT_MESSAGES[rndIdx];
                    alertText = alertText.replace(/{tienda}/g, `*${s.name}*`).replace(/{min}/g, diffMins);
                    alerts.push(alertText);
                }
            }
        });

        if (alerts.length > 0) {
            const finalAlertStr = `🔴 *SLA RUTINA DE INACTIVIDAD* 🔴\n\n` + alerts.join('\n\n') + `\n\n⚡ _El Diablito Intelligence_`;
            await sendWhatsApp(grupoId, finalAlertStr, cfg);
            return NextResponse.json({ success: true, alertsSent: alerts.length });
        }

        return NextResponse.json({ success: true, reason: 'All stores within SLA limit' });
    } catch (err) {
        console.error('SLA error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
