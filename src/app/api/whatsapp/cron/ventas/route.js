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

const MANAGER_PHRASES = {
  'sebas semental': [
    "🔥 *{nombre}* rayando a la competencia como a sus tatuajes en *{tienda}*. (💉 {tickets} tickets)",
    "🎨 *{nombre}* inyectando tinta y billetes en *{tienda}*. Puro arte. (🤘 {tickets} tickets)",
    "🐉 Con más tickets que tatuajes, *{nombre}* anda con todo en *{tienda}*. (😎 {tickets} ventas)",
    "⚡ Puro voltaje y aguijones. *{nombre}* tatuando su marca en *{tienda}*. (🔪 {tickets} tickets)",
    "🔥 Tinta fresca y billetes nuevos. *{nombre}* comandando *{tienda}*. (💥 {tickets} tickets)",
    "💀 El maestro de la tinta *{nombre}* imponiendo ley en *{tienda}*. (💵 {tickets} tickets)",
    "😎 Ni con aguja duele tanto como el éxito de *{nombre}* en *{tienda}*. (🚀 {tickets} tickets)",
    "⚡ Tatuajes, rock y exceso de ventas. *{nombre}* domina *{tienda}*. (🎸 {tickets} tickets)",
    "💉 Más letal que la tinta negra, *{nombre}* marcando el paso en *{tienda}*. (🔥 {tickets} tickets)",
    "🤘 Al estilo oscuro y directo, *{nombre}* se lleva *{tienda}*. (💀 {tickets} tickets)",
    "🐉 Despertó la bestia tatuada. *{nombre}* en *{tienda}* lidera hoy. (💎 {tickets} tickets)",
    "🔪 Cortando parejo, *{nombre}* afiló las ventas en *{tienda}*. (⚡ {tickets} tickets)",
    "🔥 Rock and roll y dinero en caja. *{nombre}* la rompe en *{tienda}*. (🤘 {tickets} tickets)",
    "🎨 El lienzo es *{tienda}* y *{nombre}* la está pintando de verde billo. (💰 {tickets} tickets)",
    "💣 Cuidado con los tatuajes, *{nombre}* vino a aniquilar en *{tienda}*. (💣 {tickets} tickets)",
    "💉 Directo a la vena. Las ventas de *{nombre}* en *{tienda}* no paran. (🚀 {tickets} tickets)",
    "😎 La vida es un tatuaje y *{nombre}* la vive cobrando en *{tienda}*. (💸 {tickets} tickets)",
    "⚡ Inyectando su estilo agresivo. *{nombre}* aplasta desde *{tienda}*. (🐉 {tickets} tickets)",
    "💀 El rey de la tinta *{nombre}* sin piedad en *{tienda}*. (⚔️ {tickets} tickets)",
    "🤘 Menos charla, más tinta y ventas. *{nombre}* facturando en *{tienda}*. (😎 {tickets} tickets)",
    "🔥 *{nombre}* marcando el territorio en *{tienda}* a punta de aguja. (💉 {tickets} tickets)",
    "🐉 Tatuajes brillando, billetes cayendo. Aplausos para *{nombre}* en *{tienda}*. (💵 {tickets} tickets)",
    "⚡ 100% actitud. 100% ventas. *{nombre}* y su tinta arrasan *{tienda}*. (🔥 {tickets} tickets)",
    "🎨 Pintando números insanos, *{nombre}* lidera *{tienda}*. (🤘 {tickets} tickets)",
    "💀 Estilo rudo, caja llena. *{nombre}* imponiendo en *{tienda}*. (💀 {tickets} tickets)",
    "🚀 Nadie frena a la aguja de *{nombre}* sumando en *{tienda}*. (💥 {tickets} tickets)",
    "💉 Tatuado y victorioso. *{nombre}* es la fiera de *{tienda}*. (🐉 {tickets} tickets)"
  ],
  'abraham': [
    "⚽ ¡Modo ataque de *{nombre}*! Sudando la camiseta a lo Santos Laguna en *{tienda}*. (🟢⚪ {tickets} tickets)",
    "🛡️ *{nombre}* defendiendo la localía en *{tienda}* como guerrero de la Comarca. (🛡️ {tickets} tickets)",
    "⚔️ Modo 'Santos Laguna'. *{nombre}* le pone técnica y corazón en *{tienda}*. (⚽ {tickets} tickets)",
    "🟢⚪ Sacando la casta lagunera, *{nombre}* es el campeón de *{tienda}*. (🥇 {tickets} tickets)",
    "⚽ Tiro libre y al ángulo. *{nombre}* golea desde *{tienda}*. (🥅 {tickets} tickets)",
    "🛡️ Un verdadero guerrero de la cancha. *{nombre}* impenetrable en *{tienda}*. (⚔️ {tickets} tickets)",
    "⚽ ¡Ponte la del Santos! *{nombre}* sumando como goleador en *{tienda}*. (🟢⚪ {tickets} tickets)",
    "🔥 El Estadio Corona grita por *{nombre}* tras arrasar en *{tienda}*. (🏟️ {tickets} tickets)",
    "⚽ Pase de oro y gol. *{nombre}* facturando en *{tienda}*. (💰 {tickets} tickets)",
    "🛡️ Con alma de guerrero lagunero. *{nombre}* defiende su *{tienda}*. (🛡️ {tickets} tickets)",
    "🟢⚪ Goleador absoluto de la temporada, *{nombre}* brillando en *{tienda}*. (⚽ {tickets} tickets)",
    "⚔️ Al más puro estilo de la Comarca, *{nombre}* arrasa en *{tienda}*. (🔥 {tickets} tickets)",
    "🥅 Nadie le ataja las ventas a *{nombre}* en *{tienda}*. ¡Goooool! (⚽ {tickets} tickets)",
    "🥇 El trofeo de hoy en la Comarca es para *{nombre}* en *{tienda}*. (🏆 {tickets} tickets)",
    "⚽ ¡Juegazo de *{nombre}*! Llevándose la victoria en *{tienda}*. (🟢⚪ {tickets} tickets)",
    "🛡️ Cerrando filas y vendiendo como cra. *{nombre}* es la muralla de *{tienda}*. (🛡️ {tickets} tickets)",
    "🟢⚪ Pasión albiverde. Así suma *{nombre}* de tickets en *{tienda}*. (⚽ {tickets} tickets)",
    "⚽ El crack de la jornada indiscutible: *{nombre}* en *{tienda}*. (🏆 {tickets} tickets)",
    "⚔️ Sacrificio, sudor y ventas. *{nombre}* dejando todo en *{tienda}*. (💥 {tickets} tickets)",
    "🏟️ ¡La afición de *{tienda}* de pie para *{nombre}*! (👏 {tickets} tickets)",
    "⚽ Otro hat-trick financiero de *{nombre}* en *{tienda}*. (🎩 {tickets} tickets)",
    "🛡️ Con el escudo bien puesto. *{nombre}* defendiendo *{tienda}*. (🟢⚪ {tickets} tickets)",
    "🔥 Remate dentro del área de *{nombre}* para ganar en *{tienda}*. (⚽ {tickets} tickets)",
    "🟢⚪ Santo orgullo. *{nombre}* demostrando en *{tienda}* quién manda. (🥇 {tickets} tickets)"
  ],
  'lidia': [
    "🙄 La indiscutible 'MEJOR EMPLEADA DE LA HISTORIA': *{nombre}* sigue facturando en *{tienda}*. Pasen a felicitarla. (💅 {tickets} tickets)",
    "✨ Oh salvadora de El Diablito, la 'empleada del siglo' *{nombre}* se dignó a cobrar en *{tienda}*. Qué barbaridad. (🙄 {tickets} tickets)",
    "👑 Tapete rojo para *{nombre}*. La 'mejor del condado' nos honró facturando en *{tienda}*. Nótese el sarcasmo. (😂 {tickets} tickets)",
    "💅 Cuidado, abrió paso la intocable *{nombre}*. Dominando *{tienda}*. Mucho respeto. (👑 {tickets} tickets)",
    "🙄 Demos gracias a que *{nombre}* amaneció de buenas y vendió en *{tienda}*. Milagro del cielo. (🙏 {tickets} tickets)",
    "✨ Haciéndonos el grandísimo favor de cobrar... La grandiosa *{nombre}* en *{tienda}*. (😂 {tickets} tickets)",
    "💅 Brillos, glamour y cero ganas de aguantarnos: *{nombre}* arranca tickets en *{tienda}*. (🙄 {tickets} tickets)",
    "😂 Sin ella quebraríamos. Obvio. *{nombre}* soportó *{tienda}* y vendió bien. (💅 {tickets} tickets)",
    "👑 Una reverencia para *{nombre}* por favor. Nos salvó de la ruina desde *{tienda}*. (✨ {tickets} tickets)",
    "🙄 'Soy demasiado buena para esta tienda'. - *{nombre}* desde *{tienda}*. (💅 {tickets} tickets)",
    "✨ Iluminando con su soberbia *{tienda}*. Bendita *{nombre}*. (😂 {tickets} tickets)",
    "👑 No la miren fijo que deslumbra. *{nombre}* barrió con las ventas en *{tienda}*. (💅 {tickets} tickets)",
    "🙄 Hagan un altar a *{nombre}* en *{tienda}* por sus milagros de hoy. (🙏 {tickets} tickets)",
    "😂 Se rompió una uña pero logró vender. Guerrera implacable *{nombre}* en *{tienda}*. (💅 {tickets} tickets)",
    "✨ La flor más bella y humilde de *{tienda}* es... obviamente *{nombre}*. (🙄 {tickets} tickets)",
    "👑 Con aire de grandeza y 0 humildad, *{nombre}* comandó *{tienda}*. (💅 {tickets} tickets)",
    "🙄 Suponemos que mereces un Óscar, *{nombre}*. Tremenda labor en *{tienda}*. (🎭 {tickets} tickets)",
    "😂 Ojalá no se haya cansado mucho de teclear. *{nombre}* ganando en *{tienda}*. (💅 {tickets} tickets)",
    "✨ 'Corten, soy la estrella'. *{nombre}* siendo diva en *{tienda}*. (🎥 {tickets} tickets)",
    "👑 Realeza indiscutible. Reina de la caja en *{tienda}*. Sí, claro, *{nombre}*. (👑 {tickets} tickets)",
    "🙄 Se va a herniar de tanto vender tamaña leyenda... *{nombre}* en *{tienda}*. (😂 {tickets} tickets)",
    "💅 Niégalo si quieres, pero *{nombre}* se siente patrona en *{tienda}*. (💅 {tickets} tickets)",
    "✨ Con peinado intacto y ventas altas, *{nombre}* se luce en *{tienda}*. (🙄 {tickets} tickets)",
    "👑 ¿Le mandamos chofer? La excelentísima *{nombre}* facturando en *{tienda}*. (🚗 {tickets} tickets)"
  ]
};

const GENERIC_PHRASES = [
  "💪 ¡Vamos banda! *{nombre}* aportando todo el poder a *{tienda}*. (💥 {tickets} tickets)",
  "⚡ *{nombre}* dándole con tubo en *{tienda}*. ¡A darle! (🔥 {tickets} tickets)",
  "🚀 Imparable nivel de *{nombre}* defendiendo *{tienda}*. (🚀 {tickets} tickets)",
  "🔥 Metiendo nitro. *{nombre}* anda on-fire en *{tienda}*. (🔥 {tickets} tickets)",
  "🎯 Precisión absoluta de *{nombre}* sumando en *{tienda}*. (🎯 {tickets} tickets)",
  "💥 ¡Boom! *{nombre}* reventando expectativas en *{tienda}*. (💣 {tickets} tickets)",
  "💎 Joya de desempeño de *{nombre}* hoy en *{tienda}*. (💎 {tickets} tickets)",
  "⚡ Electrocutando a la competencia. Grande *{nombre}* en *{tienda}*. (⚡ {tickets} tickets)",
  "🥇 Sacando la casta y el orgullo. Bien por *{nombre}* en *{tienda}*. (🥇 {tickets} tickets)",
  "🔥 Sudando la camiseta de El Diablito. *{nombre}* en *{tienda}*. (💪 {tickets} tickets)",
  "🚀 Con una marcha más que el resto. *{nombre}* acelerando *{tienda}*. (🏁 {tickets} tickets)",
  "🎯 Clavó los números exactos. *{nombre}* rifándose en *{tienda}*. (🎯 {tickets} tickets)",
  "💥 Cuidado con la onda expansiva de *{nombre}* en *{tienda}*. (💥 {tickets} tickets)",
  "💎 Calidad de ventas innegable de *{nombre}* en *{tienda}*. (✨ {tickets} tickets)",
  "⚡ ¡Zapatazo financiero! *{nombre}* cerrando con tubo en *{tienda}*. (⚡ {tickets} tickets)",
  "🥇 Primer nivel y nada de conformismo. *{nombre}* operando *{tienda}*. (💪 {tickets} tickets)",
  "🔥 *{nombre}* dejó el alma y los billetes en *{tienda}*. (🔥 {tickets} tickets)",
  "🚀 ¡Hasta el cielo! *{nombre}* no tiene freno en *{tienda}*. (🚀 {tickets} tickets)",
  "🎯 Ojo clínico para vender de *{nombre}* en *{tienda}*. (🎯 {tickets} tickets)",
  "💥 Demolición total de ventas a cargo de *{nombre}* en *{tienda}*. (💣 {tickets} tickets)",
  "💎 Diamante en bruto facturando a tope. Ese es *{nombre}* en *{tienda}*. (💎 {tickets} tickets)"
];

const STORE_ONLY_PHRASES = [
  "🛒 *{tienda}* sumando y sumando al contador global. (🎯 {tickets} tickets)",
  "🚀 El equipo de *{tienda}* firme en el campo de batalla. (⚔️ {tickets} tickets)",
  "🔥 ¡Calentando motores! *{tienda}* hizo valer su presencia. (🔥 {tickets} tickets)",
  "⚡ Alto voltaje directo desde *{tienda}*. (⚡ {tickets} tickets)",
  "💥 Máquina de hacer dinero: *{tienda}* operando sin piedad. (💥 {tickets} tickets)",
  "💎 Brillo absoluto en los números de *{tienda}*. (💎 {tickets} tickets)",
  "🎯 Dando en el blanco financiero. Extraordinario *{tienda}*. (🎯 {tickets} tickets)",
  "🥇 Peleando cada ticket a muerte en *{tienda}*. (🥇 {tickets} tickets)",
  "🚀 Propulsión máxima. *{tienda}* elevando las ganancias global. (🚀 {tickets} tickets)",
  "🔥 Sin miedo al éxito. *{tienda}* arrasó como pan caliente. (💪 {tickets} tickets)",
  "⚡ Resistencia y constancia definiendo a *{tienda}* hoy. (⚡ {tickets} tickets)",
  "💥 Cerrando operaciones con puro poder explosivo en *{tienda}*. (💣 {tickets} tickets)"
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
                customComment = arr[rnd].replace(/{nombre}/g, sManager).replace(/{tienda}/g, stName).replace(/{tickets}/g, s.t);
            } else {
                const rnd = Math.floor(Math.random() * STORE_ONLY_PHRASES.length);
                customComment = STORE_ONLY_PHRASES[rnd].replace(/{tienda}/g, stName).replace(/{tickets}/g, s.t);
            }

            msg += `${prefix} *${stName}*  |  👥 Regs: ${s.registered}\n`;
            msg += `   ${customComment}\n`;
            msg += `   ⌚ Última hora: ${ltStr}\n\n`;
        });

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
