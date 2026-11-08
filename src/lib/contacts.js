import { redis } from './redis';

const GW = 'https://gatewaywapp-production.up.railway.app';

/**
 * Guarda un contacto en el aparato (gateway de WhatsApp) de forma centralizada:
 *  - normaliza el teléfono a 52 + últimos 10 dígitos
 *  - verifica que el gateway responda success:true
 *  - deja registro en Redis: contact_saved_52<tel> = { ts, jid, name }
 *
 * Es idempotente con skipIfSaved: si ya hay registro, no vuelve a llamar al gateway.
 *
 * @param {Object} opts
 * @param {string} opts.phone      Teléfono en cualquier formato (10 díg, 52.., 521.., @c.us)
 * @param {string} opts.fullName   Nombre completo (requerido por el gateway)
 * @param {string} [opts.firstName] Nombre de pila (si no se da, se deriva de fullName)
 * @param {boolean} [opts.skipIfSaved] Si true y ya existe registro, no re-guarda
 * @param {Object} [opts.cfg]      wapp_config ya cargada (opcional, para evitar un get extra)
 * @returns {Promise<{success:boolean, jid?:string, error?:string, cached?:boolean, skipped?:boolean}>}
 */
export async function saveContactToDevice({ phone, fullName, firstName, skipIfSaved = false, cfg } = {}) {
  if (!phone) return { success: false, error: 'phone requerido', skipped: true };

  const digits = String(phone).replace(/\D/g, '');
  if (digits.length < 10) return { success: false, error: 'teléfono inválido', skipped: true };
  const cleanPhone = digits.startsWith('52') && digits.length >= 12 ? digits : '52' + digits.slice(-10);

  const name = (fullName || '').trim();
  if (name.length < 2) return { success: false, error: 'sin nombre', skipped: true };

  const recordKey = `contact_saved_${cleanPhone}`;
  if (skipIfSaved) {
    const existing = await redis.get(recordKey);
    if (existing) return { success: true, cached: true };
  }

  let wappConfig = cfg;
  if (!wappConfig) {
    const raw = await redis.get('wapp_config');
    wappConfig = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  }
  if (!wappConfig?.wappInstance || !wappConfig?.wappToken) {
    return { success: false, error: 'Gateway no configurado' };
  }

  const fn = (firstName || name.split(' ')[0] || '').trim();

  try {
    const res = await fetch(`${GW}/${wappConfig.wappInstance}/contacts/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${wappConfig.wappToken}` },
      body: JSON.stringify({ token: wappConfig.wappToken, number: cleanPhone, fullName: name, ...(fn ? { firstName: fn } : {}) })
    });
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(text); } catch {}

    if (data?.success === true) {
      await redis.set(recordKey, JSON.stringify({ ts: Date.now(), jid: data.jid || null, name }));
      return { success: true, jid: data.jid };
    }
    return { success: false, error: data?.message || data?.error || text.slice(0, 200) || 'Sin respuesta del gateway' };
  } catch (e) {
    return { success: false, error: 'Gateway inalcanzable: ' + e.message };
  }
}
