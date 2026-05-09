import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

const BUENAS_NOCHES_PHRASES = [
  "🌙 *¡Buenas noches, equipo!* 🍔\n\nGracias por su esfuerzo y dedicación hoy. Descansen bien, mañana vamos con todo. 💪🔥\n\n_El Diablito les desea dulces sueños._ 😈✨",
  "🌜 *¡Buenas noches, banda!* ✨\n\nOtro día más de chambear duro. Se lo merecen, a descansar como campeones. 🏆😴\n\n_El Diablito ya se va a dormir... pero mañana regresa con más fuerza._ 😈🔥",
  "🌙 *¡A dormir, guerreros!* 💤\n\nHoy dejaron todo en la cancha. Mañana recargamos energías y a darle con todo otra vez. 🚀\n\n_Buenas noches de parte de El Diablito._ 😈🌟",
  "✨ *¡Buenas noches, familia Diablito!* 🌙\n\nDescansen, recarguen y mañana arrancamos con la misma actitud ganadora. 💰🔥\n\n_Que sueñen con tickets y más tickets._ 🧾😴",
  "🌜 *¡Se acabó la jornada!* 🍔\n\nGracias por dar lo mejor de ustedes. A descansar el cuerpo y la mente. 🙏\n\n_Mañana volvemos a hacer historia. Buenas noches._ 😈💤",
  "🌙 *¡Cerramos con broche de oro!* ✨\n\nEl equipo Diablito no para. Descansen bien esta noche. 💪\n\n_Nos vemos mañana con todo el power._ 😈🔥🚀",
  "💤 *¡Buenas noches a toda la banda!* 🌙\n\nOtro día exitoso en los libros. Ahora toca recargar pilas. 🔋\n\n_El Diablito se despide... por hoy._ 😈✨",
  "🌜 *¡Hora de descansar, equipo!* 😴\n\nSe rifaron hoy, como siempre. Mañana hay más pan que hornear y más clientes que conquistar. 🍞💰\n\n_Buenas noches, familia._ 😈🌟",
  "🌙 *¡A recargar energías!* ⚡\n\nHoy fue un gran día gracias a ustedes. Descansen que mañana la seguimos rompiendo. 💥\n\n_Dulces sueños, equipo Diablito._ 😈💤",
  "✨ *¡Buenas noches, leyendas!* 🌙\n\nCada ticket, cada sonrisa al cliente, cada esfuerzo cuenta. Descansen merecidamente. 🏅\n\n_El Diablito los vigila... hasta dormido._ 😈👀💤"
];

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (!cfg.wappInstance || !cfg.wappToken) {
      return NextResponse.json({ success: false, reason: 'No WhatsApp config' });
    }

    const grupoId = await redis.get('ventas_grupo_id');
    if (!grupoId || !grupoId.includes('@g.us')) {
      return NextResponse.json({ success: false, reason: 'No group linked' });
    }

    // Pick a random phrase
    const randomIndex = Math.floor(Math.random() * BUENAS_NOCHES_PHRASES.length);
    const message = BUENAS_NOCHES_PHRASES[randomIndex];

    await sendWhatsApp(grupoId, message, cfg);

    return NextResponse.json({ success: true, sent: true, phraseIndex: randomIndex });
  } catch (err) {
    console.error('Cron Buenas Noches error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
