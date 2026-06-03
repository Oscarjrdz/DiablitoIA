// ── Colores y funciones de avatar ──
export const AVATAR_COLORS = [
  '#e53935','#d81b60','#8e24aa','#5e35b1','#1e88e5',
  '#039be5','#00acc1','#00897b','#43a047','#7cb342',
  '#f4511e','#f09300'
];

export function hashColor(s = '') {
  const str = typeof s === 'string' ? s : String(s ?? '');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function initials(name = '') {
  const s = typeof name === 'string' ? name : String(name ?? '');
  const p = s.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

// ── Tiempo relativo para la lista de chats ──
export function relTime(ts) {
  if (!ts) return 'Reciente';
  const now = new Date(), d = new Date(ts);
  const toStr = x => x.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const nowS = toStr(now), dS = toStr(d);
  if (nowS === dS)
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' });
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (dS === toStr(y)) return 'Ayer';
  if (now - d < 7 * 86400000) return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Etiqueta de separador de fecha en mensajes ──
export function dayLabel(ts) {
  if (!ts) return null;
  const d = new Date(ts), now = new Date();
  const toStr = x => x.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  if (toStr(d) === toStr(now)) return 'Hoy';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (toStr(d) === toStr(y)) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Monterrey' });
}

// ── Nombre de variante Loyverse ──
export function variantName(variant) {
  return [variant?.option1_value, variant?.option2_value, variant?.option3_value]
    .filter(Boolean).join(' / ') || '';
}

export const ORDER_TYPE_LABELS = {
  domicilio: '🛵 Domicilio',
  llevar: '🏃 Para llevar',
  comer: '🍽️ Para comer aquí',
};

// ── LRU Map con límite de tamaño para evitar memory leaks ──
export class LRUMap extends Map {
  constructor(maxSize) {
    super();
    this.maxSize = maxSize;
  }
  set(key, value) {
    if (this.has(key)) this.delete(key);
    if (this.size >= this.maxSize) this.delete(this.keys().next().value);
    return super.set(key, value);
  }
}

// ── Deduplicación de mensajes optimistas vs servidor ──
export function msgMatchesPending(serverMsg, pending) {
  if (!serverMsg.fromMe) return false;
  if (serverMsg.msgId && pending.msgId && serverMsg.msgId === pending.msgId) return true;
  if (serverMsg.text === pending.text && serverMsg.ts && pending.ts && Math.abs(serverMsg.ts - pending.ts) < 60000) return true;
  return false;
}

// ── Alarma Nuclear de Domicilio (Web Audio API) ──
export class NuclearAlarm {
  constructor() {
    this.ctx = null;
    this.oscillators = [];
    this.gainNode = null;
    this.active = false;
  }

  start() {
    if (this.active) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    this.active = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.6, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';
      osc1.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc2.frequency.setValueAtTime(444, this.ctx.currentTime);

      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.5, this.ctx.currentTime);
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(140, this.ctx.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      osc1.connect(this.gainNode);
      osc2.connect(this.gainNode);
      lfo.start(); osc1.start(); osc2.start();
      this.oscillators = [osc1, osc2, lfo];
    } catch (e) {
      console.warn('No se pudo iniciar síntesis de audio:', e);
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.oscillators.forEach(o => { try { o.stop(); } catch {} });
    this.oscillators = [];
    if (this.ctx) { try { this.ctx.close(); } catch {} this.ctx = null; }
  }
}
