'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo, useTransition, useDeferredValue } from 'react';
import styles from './page.module.css';
import { Search, MoreVertical, Paperclip, Mic, Send, ArrowLeft, X, Check, Plus, Phone, User, Users, Pencil, ChevronRight, Trash2, ImagePlus } from 'lucide-react';

// ── Avatar con iniciales y color consistente ──
const AVATAR_COLORS = [
  '#e53935','#d81b60','#8e24aa','#5e35b1','#1e88e5',
  '#039be5','#00acc1','#00897b','#43a047','#7cb342',
  '#f4511e','#f09300'
];
function hashColor(s = '') {
  const str = typeof s === 'string' ? s : String(s ?? '');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name = '') {
  const s = typeof name === 'string' ? name : String(name ?? '');
  const p = s.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const Avatar = React.memo(function Avatar({ name = '', phone = '', size = 49, picUrl = null }) {
  const [imgOk, setImgOk] = useState(!!picUrl);
  useEffect(() => setImgOk(!!picUrl), [picUrl]);
  const key = name || phone;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: imgOk ? 'transparent' : hashColor(key),
      flexShrink: 0, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.37),
      letterSpacing: 0.5, userSelect: 'none', position: 'relative'
    }}>
      {picUrl && imgOk
        ? <img src={picUrl} alt="" onError={() => setImgOk(false)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        : initials(name || phone.slice(-4))
      }
    </div>
  );
});

const Ticks = React.memo(function Ticks({ status }) {
  if (!status) return null;
  if (status === 'sent') {
    return <Check size={14} color="#8696a0" strokeWidth={2.5} />;
  }
  // delivered o read → CheckCheck manual (dos ✓)
  const color = status === 'read' ? '#53bdeb' : '#8696a0';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}>
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none">
        <path d="M1 5.5L4.5 9L10 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 5.5L9.5 9L15 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
});

// ── Formato de tiempo relativo (lista de chats) ──
function relTime(ts) {
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

// ── Separador de fecha en mensajes ──
function dayLabel(ts) {
  if (!ts) return null;
  const d = new Date(ts), now = new Date();
  const toStr = x => x.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  if (toStr(d) === toStr(now)) return 'Hoy';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (toStr(d) === toStr(y)) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Monterrey' });
}

// ── Nombre de variante Loyverse ──
function variantName(variant) {
  return [variant?.option1_value, variant?.option2_value, variant?.option3_value]
    .filter(Boolean).join(' / ') || '';
}

// ── Animación de tres puntos (typing) ──
const TypingDots = React.memo(function TypingDots() {
  return (
    <span className={styles.typingDots}>
      <span /><span /><span />
    </span>
  );
});

// ── Sintetizador de Alarma Nuclear (Web Audio API) ──
class NuclearAlarm {
  constructor() {
    this.ctx = null;
    this.oscillators = [];
    this.gainNode = null;
    this.active = false;
  }

  start() {
    if (this.active) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    this.active = true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();

      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(0.12, this.ctx.currentTime);
      this.gainNode.connect(this.ctx.destination);

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'sawtooth';

      osc1.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc2.frequency.setValueAtTime(444, this.ctx.currentTime);

      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(0.5, this.ctx.currentTime); // 2 segundos por ciclo

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(140, this.ctx.currentTime); // modulación +/- 140Hz

      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);

      osc1.connect(this.gainNode);
      osc2.connect(this.gainNode);

      lfo.start();
      osc1.start();
      osc2.start();

      this.oscillators = [osc1, osc2, lfo];
    } catch (e) {
      console.warn("No se pudo iniciar la síntesis de audio:", e);
    }
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.oscillators.forEach(o => {
      try { o.stop(); } catch(e) {}
    });
    this.oscillators = [];
    if (this.ctx) {
      try { this.ctx.close(); } catch(e) {}
      this.ctx = null;
    }
  }
}

const ORDER_TYPE_LABELS = { domicilio: '🛵 Domicilio', llevar: '🏃 Para llevar', comer: '🍽️ Para comer aquí' };

export default function ChatPage() {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [attachment, setAttachment] = useState(null);
  const [profilePics, setProfilePics] = useState({});
  const [chatToDelete, setChatToDelete] = useState(null);
  const [deletingChat, setDeletingChat] = useState(false);
  const [toast, setToast] = useState(null);
  const [clientCard, setClientCard] = useState(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editStore, setEditStore] = useState('');
  const [editName, setEditName] = useState('');
  const [editingField, setEditingField] = useState(null); // 'name' | 'address' | 'store' | null
  const [savingField, setSavingField] = useState(false);
  const [botSilent, setBotSilent] = useState(false);

  // POS
  const [posItems, setPosItems] = useState([]);
  const [posStores, setPosStores] = useState([]);
  const [posPayTypes, setPosPayTypes] = useState([]);
  const [posPayTypeId, setPosPayTypeId] = useState('');
  const [posLoading, setPosLoading] = useState(false);
  const [posCart, setPosCart] = useState([]);
  const [posStoreId, setPosStoreId] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [posSending, setPosSending] = useState(false);
  const [posVariantPicker, setPosVariantPicker] = useState(null); // null | { item }
  const [posGroupPickerOpen, setPosGroupPickerOpen] = useState(false);
  const [posSelectedGroups, setPosSelectedGroups] = useState([]);
  const [posSendingToGroups, setPosSendingToGroups] = useState(false);
  const [posComment, setPosComment] = useState('');
  const [posModifiers, setPosModifiers] = useState([]);
  const [posModifierPicker, setPosModifierPicker] = useState(null); // { item, variant, modifiers }
  const [posSelectedModifiers, setPosSelectedModifiers] = useState([]);
  const [posOrderType, setPosOrderType] = useState('domicilio');

  // New chat
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [newPhoneLoyverse, setNewPhoneLoyverse] = useState(null); // null | { found, name, id, points }
  const [newPhoneSearching, setNewPhoneSearching] = useState(false);

  // Groups management
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [gatewayGroups, setGatewayGroups] = useState([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState([]);
  const [pinnedGroupsData, setPinnedGroupsData] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [pinningGroup, setPinningGroup] = useState(null);
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  // Venta Sugestiva
  const [vsOpen, setVsOpen] = useState(false);
  const [vsMessages, setVsMessages] = useState([]);
  const [vsEditing, setVsEditing] = useState(null); // null | { id?, name, text, image }
  const [vsSending, setVsSending] = useState(null); // id being sent

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeChatRef = useRef(null);
  const msgPollRef = useRef(null);
  const listPollRef = useRef(null);
  const typingTimerRef = useRef(null);
  const lastMsgCountRef = useRef(0);
  const lastTsRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const failCountRef = useRef(0);
  const [isOffline, setIsOffline] = useState(false);
  const picQueueRef = useRef([]);
  const picLoadingRef = useRef(0);
  const picQueuedRef = useRef(new Set());
  const posDataLoadedRef = useRef(false);
  const msgFetchControllerRef = useRef(null);

  // ── Mensajes pendientes (optimistas) + React 19 hooks ──
  const [pendingMsgs, setPendingMsgs] = useState([]);
  const [, startCartTransition] = useTransition();
  const deferredPosSearch = useDeferredValue(posSearch);

  // ── Alarma Nuclear de Domicilio / Recoger ──
  const [dismissedAlerts, setDismissedAlerts] = useState({});
  const alarmRef = useRef(null);

  const activeAlarms = useMemo(() => {
    return chats.filter(c => c.deliveryMode && c.needsHuman && dismissedAlerts[c.phone] !== c.lastTs);
  }, [chats, dismissedAlerts]);

  useEffect(() => {
    if (activeAlarms.length > 0) {
      if (!alarmRef.current) {
        alarmRef.current = new NuclearAlarm();
      }
      alarmRef.current.start();
    } else {
      if (alarmRef.current) {
        alarmRef.current.stop();
        alarmRef.current = null;
      }
    }
    return () => {
      if (alarmRef.current) {
        alarmRef.current.stop();
        alarmRef.current = null;
      }
    };
  }, [activeAlarms]);

  // Autoresume al hacer clic/teclear para evadir autoplay block
  useEffect(() => {
    const handleGesture = () => {
      if (activeAlarms.length > 0 && alarmRef.current) {
        alarmRef.current.start();
      }
    };
    document.addEventListener('click', handleGesture);
    document.addEventListener('keydown', handleGesture);
    return () => {
      document.removeEventListener('click', handleGesture);
      document.removeEventListener('keydown', handleGesture);
    };
  }, [activeAlarms]);

  // ── Fetch groups from gateway ──
  const fetchGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const res = await fetch('/api/whatsapp/groups');
      const data = await res.json();
      if (data.success) {
        setGatewayGroups(data.groups || []);
        setPinnedGroupIds((data.pinned || []).map(g => g.id));
        setPinnedGroupsData(data.pinned || []);
      }
    } catch {}
    setLoadingGroups(false);
  }, []);


  // ── Cargar lista de chats ──
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      const data = await res.json();
      if (data.success) {
        // Merge con estado local: si localmente el chat está en unread=0 y el servidor
        // confirma needsHuman=false (human_read activo en Redis), preservamos el 0
        // para evitar que una respuesta en vuelo sobreescriba un clear reciente.
        setChats(prev => {
          const prevMap = new Map(prev.map(c => [c.phone, c]));
          const next = (data.chats || []).map(c => {
            const local = prevMap.get(c.phone);
            if (local && local.unread === 0 && c.unread > 0 && !c.needsHuman) {
              return { ...c, unread: 0 };
            }
            return local &&
              local.unread === c.unread &&
              local.needsHuman === c.needsHuman &&
              local.lastTs === c.lastTs &&
              local.lastText === c.lastText
              ? local  // sin cambios → misma referencia → React no re-renderiza la fila
              : c;
          });
          // Si el array es idéntico en longitud y todas las refs son iguales, no actualizar
          if (next.length === prev.length && next.every((c, i) => c === prev[i])) return prev;
          return next;
        });
        failCountRef.current = 0;
        setIsOffline(false);
        const toLoad = (data.chats || []).slice(0, 20);
        toLoad.forEach(c => queueProfilePic(c.phone));
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= 3) setIsOffline(true);
    }
    setLoadingChats(false);
  }, []); // eslint-disable-line

  // ── Profile pic queue (max 3 concurrent) ──
  const queueProfilePic = useCallback((phone) => {
    if (picQueuedRef.current.has(phone)) return;
    picQueuedRef.current.add(phone);
    setProfilePics(prev => ({ ...prev, [phone]: null }));
    picQueueRef.current.push(phone);
    drainPicQueue();
  }, []);

  const drainPicQueue = useCallback(() => {
    while (picQueueRef.current.length > 0 && picLoadingRef.current < 3) {
      const phone = picQueueRef.current.shift();
      picLoadingRef.current++;
      fetch(`/api/whatsapp/profile-pic?phone=${encodeURIComponent(phone)}`)
        .then(r => r.json())
        .then(data => setProfilePics(prev => ({ ...prev, [phone]: data.url || null })))
        .catch(() => {})
        .finally(() => { picLoadingRef.current--; drainPicQueue(); });
    }
  }, []);

  useEffect(() => {
    fetchChats();
    listPollRef.current = setInterval(fetchChats, 3000);
    return () => clearInterval(listPollRef.current);
  }, [fetchChats]);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  // ── Cargar mensajes del chat activo (delta-aware) ──
  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return;
    msgFetchControllerRef.current?.abort();
    const controller = new AbortController();
    msgFetchControllerRef.current = controller;
    try {
      const res = await fetch(`/api/whatsapp/history?phone=${encodeURIComponent(phone)}`, { signal: controller.signal });
      const data = await res.json();
      if (data.success) {
        if (activeChatRef.current?.phone !== phone) return;
        if (data.msgCount !== lastMsgCountRef.current || data.lastTs !== lastTsRef.current) {
          setMessages(data.messages || []);
          lastMsgCountRef.current = data.msgCount || 0;
          lastTsRef.current = data.lastTs || 0;
        }
        setIsTyping(!!data.isTyping);
        setBotSilent(!!data.botSilent);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }, []);

  const fetchClientCard = useCallback(async (phone) => {
    setLoadingCard(true);
    setClientCard(null);
    try {
      const res = await fetch(`/api/loyverse/client-card?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) setClientCard(data);
    } catch {}
    setLoadingCard(false);
  }, []);

  const saveClientField = useCallback(async (field) => {
    if (!clientCard?.client?.customerId) return;
    setSavingField(true);
    try {
      const body = { id: clientCard.client.customerId };
      if (field === 'name') { body.name = editName; body._phone = clientCard.client.phone; }
      if (field === 'address') body.address = editAddress;
      if (field === 'store') {
        const currentNote = clientCard.client._note || '';
        body.note = currentNote.includes('Tienda:')
          ? currentNote.replace(/Tienda:\s*.+?(\n|$)/, `Tienda: ${editStore}$1`)
          : (currentNote ? `${currentNote}\nTienda: ${editStore}` : `Tienda: ${editStore}`);
        body._storeRedis = editStore;
        body._phone = clientCard.client.phone;
      }
      const res = await fetch('/api/loyverse/client-card', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setClientCard(prev => ({
          ...prev,
          client: {
            ...prev.client,
            name: field === 'name' ? editName : prev.client.name,
            address: field === 'address' ? editAddress : prev.client.address,
            tienda: field === 'store' ? editStore : prev.client.tienda
          }
        }));
        if (field === 'name') {
          setChats(prev => prev.map(c => c.phone === activeChat?.phone ? { ...c, name: editName } : c));
        }
        showToast('Actualizado correctamente', 'success');
        setEditingField(null);
      } else {
        showToast('Error al guardar', 'error');
      }
    } catch { showToast('Error de conexión', 'error'); }
    setSavingField(false);
  }, [clientCard, editAddress, editStore, editName, activeChat]);

  const fetchPOSData = useCallback(async () => {
    if (posDataLoadedRef.current) return;
    posDataLoadedRef.current = true;
    setPosLoading(true);
    try {
      const res = await fetch('/api/loyverse/pos');
      const data = await res.json();
      if (data.success) {
        setPosItems(data.items || []);
        setPosStores(data.stores || []);
        setPosPayTypes(data.paymentTypes || []);
        setPosModifiers(data.modifiers || []);
        if (data.paymentTypes?.length) setPosPayTypeId(data.paymentTypes[0].id);
      }
    } catch {}
    setPosLoading(false);
  }, []);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Venta Sugestiva ──
  const fetchVsMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/suggestive-messages');
      const data = await res.json();
      if (data.success) setVsMessages(data.messages || []);
    } catch {}
  }, []);

  const vsSend = useCallback(async (msg) => {
    if (!activeChat || vsSending) return;
    setVsSending(msg.id);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChat.phone,
          text: msg.text,
          attachment: msg.image || null,
          attachmentType: msg.image ? 'image' : null
        })
      });
      const data = await res.json();
      if (data.success) {
        setVsOpen(false);
        fetch('/api/whatsapp/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: activeChat.phone, read: true })
        }).catch(() => {});
        setChats(prev => prev.map(c => c.phone === activeChat.phone
          ? { ...c, lastText: msg.text, lastTs: Date.now(), fromMe: true, needsHuman: false, unread: 0 }
          : c));
      } else {
        showToast('Error al enviar', 'error');
      }
    } catch {
      showToast('Error de conexión', 'error');
    }
    setVsSending(null);
  }, [activeChat, vsSending]);

  const vsSaveMsg = useCallback(async () => {
    if (!vsEditing?.name?.trim() || !vsEditing?.text?.trim()) return;
    try {
      const isNew = !vsEditing.id;
      const res = await fetch('/api/whatsapp/suggestive-messages', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vsEditing)
      });
      const data = await res.json();
      if (data.success) {
        setVsMessages(prev => isNew ? [...prev, data.message] : prev.map(m => m.id === data.message.id ? data.message : m));
        setVsEditing(null);
      }
    } catch {}
  }, [vsEditing]);

  const vsDeleteMsg = useCallback(async (id) => {
    try {
      await fetch(`/api/whatsapp/suggestive-messages?id=${id}`, { method: 'DELETE' });
      setVsMessages(prev => prev.filter(m => m.id !== id));
    } catch {}
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchVsMessages(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchPOSData(); }, []);

  const openChat = useCallback((chat) => {
    activeChatRef.current = chat;
    setActiveChat(chat);
    setMessages([]);
    setPendingMsgs([]);
    setIsTyping(false);
    setInputText('');
    setAttachment(null);
    isAtBottomRef.current = true;
    lastMsgCountRef.current = 0;
    lastTsRef.current = 0;
    clearInterval(msgPollRef.current);
    fetchMessages(chat.phone);
    fetchClientCard(chat.phone);
    queueProfilePic(chat.phone);
    fetchPOSData();
    msgPollRef.current = setInterval(() => {
      if (activeChatRef.current?.phone === chat.phone) fetchMessages(chat.phone);
    }, 1000);
  }, [fetchMessages, fetchClientCard, queueProfilePic, fetchPOSData]);

  useEffect(() => () => clearInterval(msgPollRef.current), []);

  // ── Smart scroll: only auto-scroll when user is at bottom ──
  const messagesContainerRef = useRef(null);
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  // ── Auto-resize textarea ──
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  // ── Enviar estado "escribiendo" al contacto con debounce ──
  const sendTypingStatus = useCallback((phone, typing) => {
    fetch('/api/whatsapp/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, typing })
    }).catch(() => {});
  }, []);

  // ── Toggle pin group (defined here so fetchChats and showToast are available) ──
  const togglePinGroup = useCallback(async (group) => {
    const isPinned = pinnedGroupIds.includes(group.id);
    setPinningGroup(group.id);
    try {
      if (isPinned) {
        await fetch(`/api/whatsapp/groups?groupId=${encodeURIComponent(group.id)}`, { method: 'DELETE' });
        setPinnedGroupIds(prev => prev.filter(id => id !== group.id));
        setPinnedGroupsData(prev => prev.filter(g => g.id !== group.id));
        showToast(`${group.name} desfijado`, 'success');
      } else {
        await fetch('/api/whatsapp/groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: group.id, groupName: group.name })
        });
        setPinnedGroupIds(prev => [...prev, group.id]);
        setPinnedGroupsData(prev => [...prev, { id: group.id, name: group.name }]);
        showToast(`${group.name} fijado ✅`, 'success');
      }
      fetchChats();
    } catch {
      showToast('Error al actualizar grupo', 'error');
    }
    setPinningGroup(null);
  }, [pinnedGroupIds, fetchChats]);

  // ── Rename pinned group (local only) ──
  const renameGroup = useCallback(async (groupId, newName) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/whatsapp/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, newName: newName.trim() })
      });
      if (res.ok) {
        setPinnedGroupsData(prev => prev.map(g => g.id === groupId ? { ...g, name: newName.trim() } : g));
        showToast('Nombre actualizado', 'success');
        fetchChats();
      }
    } catch {
      showToast('Error al renombrar', 'error');
    }
    setRenamingGroupId(null);
    setRenameValue('');
  }, [fetchChats]);

  // ── Borrar chat ──
  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;
    setDeletingChat(true);
    try {
      const res = await fetch(`/api/whatsapp/chats?phone=${encodeURIComponent(chatToDelete.phone)}`, { method: 'DELETE' });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.phone !== chatToDelete.phone));
        if (activeChat?.phone === chatToDelete.phone) {
          setActiveChat(null);
          clearInterval(msgPollRef.current);
        }
        showToast(`Chat de ${chatToDelete.name} eliminado.`, 'success');
      } else {
        showToast('Error al eliminar el chat.', 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    } finally {
      setDeletingChat(false);
      setChatToDelete(null);
    }
  };

  // ── Toggle human read/unread ──
  const toggleHumanRead = useCallback(async (phone, currentlyNeedsHuman) => {
    try {
      await fetch('/api/whatsapp/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, read: currentlyNeedsHuman })
      });
      setChats(prev => prev.map(c =>
        c.phone === phone
          ? { ...c, needsHuman: !currentlyNeedsHuman, ...(currentlyNeedsHuman ? { unread: 0 } : {}) }
          : c
      ));
      showToast(currentlyNeedsHuman ? 'Marcado como leído' : 'Marcado como no leído', 'success');
    } catch {
      showToast('Error al actualizar', 'error');
    }
  }, []);

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    autoResize();
    if (!activeChat) return;
    sendTypingStatus(activeChat.phone, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTypingStatus(activeChat.phone, false), 3000);
  };

  // ── Adjunto ──
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const type = file.type.startsWith('image/') ? 'image'
        : file.type.startsWith('audio/') ? 'audio' : 'document';
      setAttachment({ base64: ev.target.result, type, name: file.name });
    };
    reader.readAsDataURL(file);
  };

  const clearAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Enviar mensaje ──
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text && !attachment) return;
    if (!activeChat) return;
    clearTimeout(typingTimerRef.current);
    sendTypingStatus(activeChat.phone, false);
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey'
    });
    // _localId is a unique client-side identifier used purely for dedup tracking
    const _localId = `local_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const optimistic = {
      _localId, text, attachment: attachment?.base64 || null,
      attachmentType: attachment?.type || null,
      fromMe: true, ts: now, time: timeStr, status: 'sent'
    };
    setInputText('');
    clearAttachment();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    const phone = activeChat.phone;
    setChats(prev => prev.map(c =>
      c.phone === phone
        ? { ...c, lastText: text || '📎 Archivo', lastTs: now, fromMe: true, needsHuman: false, unread: 0 }
        : c
    ));
    fetch('/api/whatsapp/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, read: true })
    }).catch(() => {});
    // Show message immediately; cleaned when poll confirms via text+window match
    setPendingMsgs(prev => [...prev, optimistic]);
    fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, text, attachment: optimistic.attachment, attachmentType: optimistic.attachmentType })
    }).then(r => r.json()).then(data => {
      if (!data.success) {
        showToast('Error al enviar mensaje', 'error');
        setPendingMsgs(prev => prev.filter(p => p._localId !== _localId));
      } else {
        // Attach server msgId to this pending msg for precise dedup
        if (data.msgId) {
          setPendingMsgs(prev => prev.map(p =>
            p._localId === _localId ? { ...p, msgId: data.msgId } : p
          ));
        }
      }
    }).catch(() => {
      showToast('Error de conexión', 'error');
      setPendingMsgs(prev => prev.filter(p => p._localId !== _localId));
    });
  }, [inputText, attachment, activeChat, sendTypingStatus, showToast]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── POS helpers ──
  const posAddItemVariant = useCallback((item, variant) => {
    let price = variant?.default_price || 0;
    if (posStoreId && variant?.stores) {
      const sp = variant.stores.find(s => s.store_id === posStoreId)?.price;
      if (sp != null) price = sp;
    }
    const variantId = variant?.variant_id;
    const vLabel = variantName(variant);
    const displayName = vLabel ? `${item.item_name} - ${vLabel}` : item.item_name;
    const cartKey = variantId;
    startCartTransition(() => {
      setPosCart(prev => {
        const idx = prev.findIndex(c => c.cartKey === cartKey);
        if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
        return [...prev, { itemId: item.id, variantId, cartKey, name: displayName, price, qty: 1 }];
      });
    });
  }, [posStoreId, startCartTransition]);

  const posUpdateQty = useCallback((idx, delta) => {
    startCartTransition(() => {
      setPosCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
    });
  }, [startCartTransition]);

  const posRemoveItem = useCallback((idx) => {
    startCartTransition(() => {
      setPosCart(prev => prev.filter((_, i) => i !== idx));
    });
  }, [startCartTransition]);

  const posHandleVariantSelect = useCallback((item, variant) => {
    const applicable = posModifiers.filter(m => item.modifier_ids?.includes(m.id));
    if (applicable.length > 0) {
      setPosVariantPicker(null);
      setPosModifierPicker({ item, variant, modifiers: applicable });
      setPosSelectedModifiers([]);
    } else {
      posAddItemVariant(item, variant);
    }
  }, [posModifiers, posAddItemVariant]);

  const posAddItemWithModifiers = useCallback(() => {
    if (!posModifierPicker) return;
    const { item, variant } = posModifierPicker;
    let basePrice = variant?.default_price || 0;
    if (posStoreId && variant?.stores) {
      const sp = variant.stores.find(s => s.store_id === posStoreId)?.price;
      if (sp != null) basePrice = sp;
    }
    const selectedOptions = [];
    posModifierPicker.modifiers.forEach(mod => {
      mod.modifier_options?.forEach(opt => {
        if (posSelectedModifiers.includes(opt.id)) {
          selectedOptions.push({ name: opt.name, price: opt.price || 0 });
        }
      });
    });
    const modTotal = selectedOptions.reduce((s, o) => s + o.price, 0);
    const effectivePrice = basePrice + modTotal;
    const variantId = variant?.variant_id;
    const vLabel = variantName(variant);
    const modLabel = selectedOptions.map(o => o.name).join(', ');
    const displayName = [vLabel ? `${item.item_name} - ${vLabel}` : item.item_name, modLabel].filter(Boolean).join(' + ');
    const cartKey = variantId + (posSelectedModifiers.length ? '|' + [...posSelectedModifiers].sort().join(',') : '');
    setPosCart(prev => {
      const idx = prev.findIndex(c => c.cartKey === cartKey);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { itemId: item.id, variantId, cartKey, name: displayName, price: effectivePrice, qty: 1 }];
    });
    setPosModifierPicker(null);
    setPosSelectedModifiers([]);
  }, [posModifierPicker, posSelectedModifiers, posStoreId]);

  const posTotal = useMemo(() => posCart.reduce((sum, c) => sum + c.price * c.qty, 0), [posCart]);

  const posFiltered = useMemo(
    () => posItems
      .filter(item => !deferredPosSearch || item.item_name.toLowerCase().includes(deferredPosSearch.toLowerCase()))
      .sort((a, b) => a.item_name.localeCompare(b.item_name, 'es')),
    [posItems, deferredPosSearch]
  );

  
  const posSendSummary = useCallback(async () => {
    if (!posCart.length || !activeChat || posSending) return;
    setPosSending(true);
    const storeName = posStores.find(s => s.id === posStoreId)?.name || '';
    const orderLabel = ORDER_TYPE_LABELS[posOrderType] || posOrderType;
    const lines = posCart.map(c =>
      `• ${c.name} x${c.qty} — $${(c.price * c.qty).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    ).join('\n');
    const text = `🛒 *Resumen de tu pedido:*\n\n*Tipo:* ${orderLabel}\n\n${lines}\n\n*Total: $${posTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*${storeName ? `\n\nSucursal: ${storeName}` : ''}`;
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeChat.phone, text })
      });
      showToast('Resumen enviado al cliente ✅', 'success');
    } catch {
      showToast('Error al enviar resumen', 'error');
    }
    setPosSending(false);
  }, [posCart, posStoreId, posStores, posTotal, activeChat, posSending, posOrderType]);

  const posSendToGroups = useCallback(async () => {
    if (!posSelectedGroups.length || posSendingToGroups) return;
    setPosSendingToGroups(true);
    const clientName = clientCard?.client?.name || activeChat?.name || 'Cliente';
    const clientPhone = (activeChat?.phone || '').replace(/^52/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    const storeName = posStores.find(s => s.id === posStoreId)?.name || '';
    const paymentName = posPayTypes.find(pt => pt.id === posPayTypeId)?.name || '';
    const orderLabel = ORDER_TYPE_LABELS[posOrderType] || posOrderType;
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' });
    const lines = posCart.map(c =>
      `• ${c.name} x${c.qty} — $${(c.price * c.qty).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    ).join('\n');
    const text =
      `📦 *Pedido por WhatsApp*\n` +
      `━━━━━━━━━━━━━━\n` +
      `👤 *Cliente:* ${clientName}\n` +
      `📱 *Tel:* ${clientPhone}\n` +
      `🕐 *Hora:* ${hora} hrs\n` +
      `🚚 *Tipo:* ${orderLabel}\n` +
      (storeName ? `🏪 *Sucursal:* ${storeName}\n` : '') +
      `\n📋 *Pedido:*\n${lines}\n\n` +
      (paymentName ? `💳 *Pago:* ${paymentName}\n` : '') +
      `💰 *Total: $${posTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*\n` +
      (posComment.trim() ? `\n💬 *Comentarios:*\n${posComment.trim()}\n` : '') +
      `━━━━━━━━━━━━━━`;
    try {
      await Promise.all(posSelectedGroups.map(groupId =>
        fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: groupId, text })
        })
      ));
      showToast(`Pedido enviado a ${posSelectedGroups.length} sucursal(es) ✅`, 'success');
      setPosGroupPickerOpen(false);
      setPosSelectedGroups([]);
      setPosComment('');
    } catch {
      showToast('Error al enviar a sucursales', 'error');
    }
    setPosSendingToGroups(false);
  }, [posSelectedGroups, posCart, posStoreId, posStores, posPayTypeId, posPayTypes, posTotal, clientCard, activeChat, posSendingToGroups, posOrderType, posComment]);

  const stores = useMemo(
    () => [...new Set(chats.map(c => c.store).filter(Boolean))].sort(),
    [chats]
  );

  const filtered = useMemo(() => chats.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchStore = !storeFilter || c.store === storeFilter;
    return matchSearch && matchStore;
  }), [chats, search, storeFilter]);

  // ── Helper: check if a poll message matches a pending optimistic message ──
  const msgMatchesPending = useCallback((serverMsg, pending) => {
    if (!serverMsg.fromMe) return false;
    // Match by msgId if both have one
    if (serverMsg.msgId && pending.msgId && serverMsg.msgId === pending.msgId) return true;
    // Match by identical text + timestamp within 60s window
    if (serverMsg.text === pending.text && serverMsg.ts && pending.ts && Math.abs(serverMsg.ts - pending.ts) < 60000) return true;
    return false;
  }, []);

  // Combinar mensajes reales + pendientes sin duplicados (text + time-window match)
  const allMessages = useMemo(() => {
    if (!pendingMsgs.length) return messages;
    const result = [...messages];
    for (const p of pendingMsgs) {
      // Only append if no server message already matches this pending
      if (!result.some(m => msgMatchesPending(m, p))) result.push(p);
    }
    return result;
  }, [messages, pendingMsgs, msgMatchesPending]);

  // Limpiar pendientes que ya confirmó el poll
  useEffect(() => {
    if (!pendingMsgs.length) return;
    setPendingMsgs(prev => prev.filter(p => !messages.some(m => msgMatchesPending(m, p))));
  }, [messages]); // eslint-disable-line

  const msgsWithSeps = useMemo(() => {
    const result = [];
    let lastLabel = null;
    let addedUndated = false;
    for (const m of allMessages) {
      if (!m.ts) {
        if (!addedUndated) {
          result.push({ _sep: true, label: 'Mensajes anteriores' });
          addedUndated = true;
        }
        result.push(m);
        continue;
      }
      const label = dayLabel(m.ts);
      if (label && label !== lastLabel) {
        result.push({ _sep: true, label });
        lastLabel = label;
      }
      result.push(m);
    }
    return result;
  }, [allMessages]);

  // Scroll al fondo cuando llegan mensajes nuevos o se envía uno
  useEffect(() => {
    if (allMessages.length && isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [allMessages]);

  return (
    <div className={styles.root}>

      {/* ══ PANEL IZQUIERDO ══ */}
      <div className={`${styles.left} ${activeChat ? styles.leftHidden : ''}`}>

        {isOffline && (
          <div className={styles.offlineBanner}>
            ⚠️ Sin conexión — reintentando...
          </div>
        )}

        <div className={styles.leftHeader}>
          <Avatar name="El Diablito" size={40} />
          <span className={styles.leftTitle}>Chats</span>
          <div className={styles.headerIconsLeft}>
            <button
              className={styles.groupsBtn}
              title="Gestionar Grupos"
              onClick={() => { setShowGroupsModal(true); fetchGroups(); }}
            >
              <Users size={20} />
            </button>
            <MoreVertical size={20} />
          </div>
        </div>

        <div className={styles.searchBar}>
          <div className={styles.searchWrap}>
            <Search size={15} color="#8696a0" />
            <input
              className={styles.searchInput}
              placeholder="Buscar o empezar chat"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 0, lineHeight: 0 }}
                onClick={() => setSearch('')}><X size={14} /></button>
            )}
          </div>
        </div>

        {/* ── Filtro por sucursal ── */}
        <div className={styles.storeFilterBar}>
          <select
            className={styles.storeSelect}
            value={storeFilter}
            onChange={e => setStoreFilter(e.target.value)}
          >
            <option value="">Todas las sucursales</option>
            {stores.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* ── Botón Agregar Chat ── */}
        <div className={styles.newChatSection}>
          <button
            className={`${styles.newChatToggle} ${showNewChat ? styles.newChatToggleActive : ''}`}
            onClick={() => {
              setShowNewChat(!showNewChat);
              setNewPhone(''); setNewName('');
              setNewPhoneLoyverse(null);
            }}
          >
            <Plus size={16} />
            <span>Agregar Chat</span>
            {showNewChat && <X size={14} style={{ marginLeft: 'auto' }} />}
          </button>

          {showNewChat && (
            <div className={styles.newChatForm}>
              {/* Teléfono */}
              <div className={styles.newChatInputRow}>
                <Phone size={16} color="#8696a0" />
                <input
                  className={styles.newChatInput}
                  placeholder="Número WhatsApp (ej: 8112345678)"
                  value={newPhone}
                  onChange={async e => {
                    const val = e.target.value.replace(/\D/g, '');
                    setNewPhone(val);
                    setNewPhoneLoyverse(null);
                    if (val.length === 10) {
                      setNewPhoneSearching(true);
                      try {
                        const res = await fetch(`/api/loyverse/client-card?phone=52${val}`);
                        const data = await res.json();
                        if (data.success && data.client?.customerId) {
                          setNewPhoneLoyverse({ found: true, name: data.client.name, id: data.client.customerId, points: data.client.points });
                          setNewName(data.client.name);
                        } else {
                          setNewPhoneLoyverse({ found: false });
                          setNewName('');
                        }
                      } catch {
                        setNewPhoneLoyverse({ found: false });
                      }
                      setNewPhoneSearching(false);
                    }
                  }}
                  maxLength={10}
                />
                {newPhoneSearching && <span style={{ fontSize: 11, color: '#8696a0', flexShrink: 0 }}>Buscando...</span>}
              </div>

              {/* Badge resultado Loyverse */}
              {newPhoneLoyverse && (
                <div style={{
                  fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 8,
                  background: newPhoneLoyverse.found ? 'rgba(0,168,132,0.12)' : 'rgba(245,158,11,0.12)',
                  color: newPhoneLoyverse.found ? '#00a884' : '#f59e0b',
                  border: `1px solid ${newPhoneLoyverse.found ? 'rgba(0,168,132,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}>
                  {newPhoneLoyverse.found
                    ? `✅ Cliente en Loyverse: ${newPhoneLoyverse.name} · ${newPhoneLoyverse.points ?? 0} pts`
                    : '⚠️ No encontrado en Loyverse'}
                </div>
              )}

              {/* Nombre — solo editable si no está en Loyverse */}
              {newPhoneLoyverse?.found === false && (
                <div className={styles.newChatInputRow}>
                  <User size={16} color="#8696a0" />
                  <input
                    className={styles.newChatInput}
                    placeholder="Nombre del contacto"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                  />
                </div>
              )}

              {/* Botón principal */}
              <button
                className={styles.newChatBtn}
                disabled={creatingChat || newPhone.length < 10 || newPhoneSearching || (!newPhoneLoyverse) || (newPhoneLoyverse?.found === false && !newName.trim())}
                onClick={async () => {
                  const cleanPhone = '52' + newPhone.slice(-10);
                  const existing = chats.find(c => c.phone === cleanPhone);
                  if (existing) {
                    openChat(existing);
                    setShowNewChat(false); setNewPhone(''); setNewName(''); setNewPhoneLoyverse(null);
                    showToast('Chat ya existe, abriendo...');
                    return;
                  }
                  setCreatingChat(true);
                  let loyverseOk = newPhoneLoyverse?.found; // ya existía
                  if (!newPhoneLoyverse?.found) {
                    // No existe en Loyverse → crear cliente automáticamente
                    try {
                      const loyRes = await fetch('/api/loyverse/client-card', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName.trim(), phone: newPhone.slice(-10) })
                      });
                      const loyData = await loyRes.json();
                      loyverseOk = loyRes.ok && loyData.success;
                      if (!loyverseOk) {
                        console.error('[crear cliente]', loyData);
                        showToast(`Error Loyverse: ${loyData.error?.errors?.[0]?.message || JSON.stringify(loyData.error) || 'Error desconocido'}`, 'error');
                      }
                    } catch (e) {
                      console.error('[crear cliente]', e);
                      showToast('Error de conexión al crear cliente', 'error');
                    }
                  }
                  await fetch('/api/whatsapp/create-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: cleanPhone, name: newName.trim() }) });
                  const newChat = { phone: cleanPhone, name: newName.trim() || newPhone.slice(-10), lastText: '', lastTs: Date.now(), fromMe: false, unread: 0, msgCount: 0, store: '', needsHuman: false };
                  setChats(prev => [newChat, ...prev]);
                  openChat(newChat);
                  setShowNewChat(false); setNewPhone(''); setNewName(''); setNewPhoneLoyverse(null);
                  if (loyverseOk) showToast(newPhoneLoyverse?.found ? 'Chat creado ✅' : 'Chat creado y cliente registrado en Loyverse ✅');
                  setCreatingChat(false);
                }}
              >
                <Plus size={16} />
                {creatingChat ? 'Creando...' : newPhoneLoyverse?.found ? 'Abrir Chat' : 'Crear Cliente + Chat'}
              </button>
            </div>
          )}
        </div>

        <div className={styles.chatList}>
          {loadingChats && <p className={styles.tip}>Cargando chats...</p>}
          {!loadingChats && filtered.length === 0 && (
            <p className={styles.tip}>{storeFilter ? `Sin chats en ${storeFilter}` : 'Sin chats aún'}</p>
          )}
          {filtered.map(chat => (
            <div
              key={chat.phone}
              className={`${styles.chatItem} ${activeChat?.phone === chat.phone ? styles.chatActive : ''}`}
              onClick={() => openChat(chat)}
            >
              <div className={styles.avatarWrap}>
                <div className={chat.deliveryMode ? styles.deliveryRing : undefined}>
                  <Avatar name={chat.name} phone={chat.phone} size={49} picUrl={profilePics[chat.phone]} />
                </div>
                {chat.unread > 0 && <span className={styles.avatarBadge}>{chat.unread > 99 ? '99+' : chat.unread}</span>}
              </div>
              <div className={styles.chatMeta}>
                <div className={styles.chatRow1}>
                  <span className={styles.chatName}>{chat.name}</span>
                  <span className={chat.unread > 0 ? styles.chatTimeUnread : styles.chatTime}>
                    {relTime(chat.lastTs)}
                  </span>
                </div>
                <div className={styles.chatRow2}>
                  <span className={styles.chatPreview}>
                    {chat.fromMe && <Ticks status="delivered" />}
                    {chat.fromMe && ' '}
                    {chat.lastText || <em style={{ opacity: 0.4 }}>Sin mensajes</em>}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {chat.botSilent && <span className={styles.botSilentBadge} title="Bot silenciado">🤖💤</span>}
                    {chat.needsHuman && <span className={styles.needsHumanBadge} title="Sin atención humana">●</span>}

                  </div>
                </div>
              </div>
              <div className={styles.chatActionBtns}>
                <button
                  className={styles.chatMarkBtn}
                  onClick={e => { e.stopPropagation(); toggleHumanRead(chat.phone, chat.needsHuman); }}
                  title={chat.needsHuman ? 'Marcar como leído' : 'Marcar como no leído'}
                >
                  {chat.needsHuman ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
                <button
                  className={styles.chatDeleteBtn}
                  onClick={e => { e.stopPropagation(); setChatToDelete(chat); }}
                  title="Eliminar chat"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ PANEL DERECHO ══ */}
      {activeChat ? (
        <div className={styles.right}>

          <div className={styles.rightHeader}>
            <button className={styles.backBtn} onClick={() => { setActiveChat(null); clearInterval(msgPollRef.current); }}>
              <ArrowLeft size={22} />
            </button>
            <Avatar name={activeChat.name} phone={activeChat.phone} size={40} picUrl={profilePics[activeChat.phone]} />
            <div className={styles.headerInfo}>
              <span className={styles.headerName}>{activeChat.name}</span>
              <span className={styles.headerSub}>
                {isTyping
                  ? <span className={styles.typingLabel}>escribiendo<TypingDots /></span>
                  : activeChat.phone.replace(/^52/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}
              </span>
            </div>
            <div className={styles.headerIcons}>
              <button
                className={styles.vsBtn}
                onClick={() => { setVsOpen(v => !v); setVsEditing(null); }}
                title="Venta Sugestiva"
              >
                💬 Venta Sugestiva
              </button>
              <button
                className={`${styles.botToggle} ${botSilent ? styles.botToggleSilent : styles.botToggleActive}`}
                title={botSilent ? 'Bot silenciado — clic para reactivar' : 'Bot activo — clic para silenciar'}
                onClick={async () => {
                  const newSilent = !botSilent;
                  setBotSilent(newSilent);
                  await fetch('/api/whatsapp/bot-silence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: activeChat.phone, silent: newSilent })
                  });
                }}
              >
                🤖 {botSilent ? 'Silenciado' : 'Activo'}
              </button>
              <Search size={20} />
              <MoreVertical size={20} />
            </div>
          </div>

          <div className={styles.messages} ref={messagesContainerRef} onScroll={handleScroll}>
            {msgsWithSeps.map((item, i) => {
              if (item._sep) {
                return (
                  <div key={'s' + i} className={styles.dateSep}>
                    <span>{item.label}</span>
                  </div>
                );
              }
              const m = item;
              return (
                <div key={m.msgId || (m.ts ? `${m.ts}_${m.fromMe ? 'o' : 'i'}` : `f${i}`)} className={m.fromMe ? styles.rowOut : styles.rowIn}>
                  {!m.fromMe && (
                    <Avatar name={activeChat.name} phone={activeChat.phone} size={28} picUrl={profilePics[activeChat.phone]} />
                  )}
                  <div className={m.fromMe ? styles.bubbleOut : styles.bubbleIn}>
                    {/* Imagen base64 optimista (antes de que llegue el poll) */}
                    {m.attachment && m.attachmentType === 'image' && (
                      <img src={m.attachment} alt="" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, display: 'block', marginBottom: 4 }} />
                    )}
                    {/* Imagen desde URL (polled del historial: salientes + entrantes + promos) */}
                    {!m.attachment && m.attachmentUrl && m.attachmentType === 'image' && (
                      <img src={m.attachmentUrl} alt="" style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, display: 'block', marginBottom: 4 }} />
                    )}
                    {/* Sticker */}
                    {m.attachmentType === 'sticker' && m.attachmentUrl && (
                      <img src={m.attachmentUrl} alt="Sticker" style={{ maxWidth: 160, borderRadius: 4, display: 'block', marginBottom: 2 }} />
                    )}
                    {/* Documento / audio */}
                    {m.hasAttachment && !m.attachmentUrl && !m.attachment && m.attachmentType !== 'sticker' && (
                      <div className={styles.fileAttach}>
                        <Paperclip size={14} />
                        <span>{m.attachmentType === 'audio' ? '🎙 Audio' : 'Archivo adjunto'}</span>
                      </div>
                    )}
                    {m.text && <span className={styles.msgText}>{m.text}</span>}
                    <div className={styles.msgMeta}>
                      {m.time && <span className={styles.msgTime}>{m.time}</span>}
                      {m.fromMe && <Ticks status={m.status} />}
                      {m.status === 'error' && (
                        <span title="Error al enviar" style={{ color: '#ef4444', fontSize: 12, marginLeft: 2 }}>⚠️</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Indicador "escribiendo" al final de los mensajes */}
            {isTyping && (
              <div className={styles.rowIn}>
                <Avatar name={activeChat.name} phone={activeChat.phone} size={28} picUrl={profilePics[activeChat.phone]} />
                <div className={styles.bubbleIn} style={{ padding: '10px 14px' }}>
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {attachment && (
            <div className={styles.attachBar}>
              {attachment.type === 'image'
                ? <img src={attachment.base64} alt="" style={{ height: 72, borderRadius: 6, objectFit: 'cover' }} />
                : <div className={styles.filePreview}><Paperclip size={15} /> {attachment.name}</div>
              }
              <button className={styles.removeAttach} onClick={clearAttachment}><X size={13} /></button>
            </div>
          )}

          <div className={styles.inputRow}>
            <button className={styles.iconBtn} onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={22} />
            </button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
            <div className={styles.inputWrap}>
              <textarea
                ref={textareaRef}
                className={styles.msgInput}
                placeholder="Escribe un mensaje"
                rows={1}
                value={inputText}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button className={styles.sendBtn} onClick={handleSend}>
              {(inputText.trim() || attachment) ? <Send size={20} /> : <Mic size={20} />}
            </button>
          </div>

          {/* ── Modal Venta Sugestiva ── */}
          {vsOpen && (
            <div className={styles.vsModal}>
              <div className={styles.vsModalHeader}>
                <span>💬 Venta Sugestiva</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={styles.vsAddBtn} onClick={() => setVsEditing({ name: '', text: '', image: null })}>
                    <Plus size={13} /> Nuevo
                  </button>
                  <button className={styles.vsCloseBtn} onClick={() => { setVsOpen(false); setVsEditing(null); }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Formulario crear/editar */}
              {vsEditing && (
                <div className={styles.vsForm}>
                  <input
                    className={styles.vsInput}
                    placeholder="Nombre del mensaje"
                    value={vsEditing.name}
                    onChange={e => setVsEditing(p => ({ ...p, name: e.target.value }))}
                  />
                  <textarea
                    className={styles.vsTextarea}
                    placeholder="Texto del mensaje"
                    rows={3}
                    value={vsEditing.text}
                    onChange={e => setVsEditing(p => ({ ...p, text: e.target.value }))}
                  />
                  {vsEditing.image && (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={vsEditing.image} alt="" style={{ height: 60, borderRadius: 6, objectFit: 'cover' }} />
                      <button className={styles.vsRemoveImg} onClick={() => setVsEditing(p => ({ ...p, image: null }))}><X size={10} /></button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <label className={styles.vsImgLabel}>
                      <ImagePlus size={13} /> Imagen
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const r = new FileReader();
                        r.onload = ev => setVsEditing(p => ({ ...p, image: ev.target.result }));
                        r.readAsDataURL(f);
                      }} />
                    </label>
                    <button className={styles.vsSaveBtn} onClick={vsSaveMsg}>Guardar</button>
                    <button className={styles.vsCancelBtn} onClick={() => setVsEditing(null)}>Cancelar</button>
                  </div>
                </div>
              )}

              {/* Lista de mensajes */}
              <div className={styles.vsList}>
                {vsMessages.length === 0 && !vsEditing && (
                  <p className={styles.vsEmpty}>Sin mensajes. Crea uno.</p>
                )}
                {vsMessages.map(msg => (
                  <div key={msg.id} className={styles.vsItem}>
                    <div className={styles.vsItemInfo}>
                      {msg.image && <img src={msg.image} alt="" className={styles.vsThumb} />}
                      <div>
                        <div className={styles.vsItemName}>{msg.name}</div>
                        <div className={styles.vsItemText}>{msg.text}</div>
                      </div>
                    </div>
                    <div className={styles.vsItemActions}>
                      <button className={styles.vsEditBtn} onClick={() => setVsEditing({ ...msg })} title="Editar">
                        <Pencil size={12} />
                      </button>
                      <button className={styles.vsDelBtn} onClick={() => vsDeleteMsg(msg.id)} title="Eliminar">
                        <Trash2 size={12} />
                      </button>
                      <button
                        className={styles.vsSendItemBtn}
                        onClick={() => vsSend(msg)}
                        disabled={!!vsSending}
                        title="Enviar al cliente"
                      >
                        {vsSending === msg.id ? '...' : <ChevronRight size={14} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      ) : (
        <div className={styles.emptyPane}>
          <div className={styles.emptyBox}>
            <div style={{ fontSize: 80, opacity: 0.1, marginBottom: 20 }}>💬</div>
            <h2 className={styles.emptyTitle}>Diablito Chat</h2>
            <p className={styles.emptySub}>Selecciona un chat para comenzar</p>
          </div>
        </div>
      )}

      {/* ══ PANEL DERECHO: TARJETA DEL CLIENTE ══ */}
      {activeChat && (
        <div className={styles.infoPanel}>
          <div className={styles.infoPanelHeader}>
            <span>Perfil del cliente</span>
          </div>

          {loadingCard ? (
            <div className={styles.infoLoading}>Cargando...</div>
          ) : (
            <div className={styles.infoFixed}>

              {/* Avatar + nombre */}
              <div className={styles.infoAvatar}>
                <Avatar
                  name={clientCard?.client?.name || activeChat.name}
                  phone={activeChat.phone}
                  size={56}
                  picUrl={profilePics[activeChat.phone]}
                />
                {editingField === 'name' ? (
                  <div className={styles.infoNameEditRow}>
                    <input
                      className={styles.infoNameInput}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      autoFocus
                      placeholder="Nombre del cliente"
                    />
                    <div className={styles.infoEditActions} style={{ justifyContent: 'center' }}>
                      <button className={styles.infoSaveBtn} onClick={() => saveClientField('name')} disabled={savingField || !editName.trim()}>
                        {savingField ? '...' : 'Guardar'}
                      </button>
                      <button className={styles.infoCancelBtn} onClick={() => setEditingField(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.infoNameRow}>
                    <div className={styles.infoName}>{clientCard?.client?.name || activeChat.name}</div>
                    {clientCard?.client?.customerId && (
                      <button className={styles.infoEditBtn} onClick={() => {
                        setEditName(clientCard?.client?.name || activeChat.name);
                        setEditingField('name');
                      }}>Editar</button>
                    )}
                  </div>
                )}
                <div className={styles.infoPhone}>
                  {(clientCard?.client?.phone10 || activeChat.phone.slice(-10)).replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}
                </div>
                {clientCard?.client?.duplicateRecords && (
                  <div className={styles.infoDuplicateWarn}>
                    ⚠️ {clientCard.client.loyverseRecords} registros en Loyverse
                  </div>
                )}
              </div>

              {/* Puntos */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>Puntos acumulados</div>
                <div className={styles.infoPoints}>
                  {clientCard?.client?.points != null
                    ? Number(clientCard.client.points).toLocaleString('es-MX')
                    : <span style={{ fontSize: 13, color: '#525d65' }}>—</span>
                  }
                </div>
              </div>

              {/* Sucursal — editable */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>
                  Sucursal
                  {editingField !== 'store' && (
                    <button className={styles.infoEditBtn} onClick={() => {
                      setEditStore(clientCard?.client?.tienda || '');
                      setEditingField('store');
                    }}>Editar</button>
                  )}
                </div>
                {editingField === 'store' ? (
                  <div className={styles.infoEditRow}>
                    <select
                      className={styles.infoEditInput}
                      value={editStore}
                      onChange={e => setEditStore(e.target.value)}
                      autoFocus
                    >
                      <option value="">— Seleccionar sucursal —</option>
                      {stores.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <div className={styles.infoEditActions}>
                      <button className={styles.infoSaveBtn} onClick={() => saveClientField('store')} disabled={savingField || !editStore}>
                        {savingField ? '...' : 'Guardar'}
                      </button>
                      <button className={styles.infoCancelBtn} onClick={() => setEditingField(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.infoAddress}>
                    {clientCard?.client?.tienda || <span className={styles.infoEmpty}>Sin sucursal</span>}
                  </div>
                )}
              </div>

              {/* Dirección — editable */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>
                  Dirección
                  {editingField !== 'address' && (
                    <button className={styles.infoEditBtn} onClick={() => {
                      setEditAddress(clientCard?.client?.address || '');
                      setEditingField('address');
                    }}>Editar</button>
                  )}
                </div>
                {editingField === 'address' ? (
                  <div className={styles.infoEditRow}>
                    <input
                      className={styles.infoEditInput}
                      value={editAddress}
                      onChange={e => setEditAddress(e.target.value)}
                      placeholder="Dirección del cliente"
                      autoFocus
                    />
                    <div className={styles.infoEditActions}>
                      <button className={styles.infoSaveBtn} onClick={() => saveClientField('address')} disabled={savingField}>
                        {savingField ? '...' : 'Guardar'}
                      </button>
                      <button className={styles.infoCancelBtn} onClick={() => setEditingField(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.infoAddress}>
                    {clientCard?.client?.address || <span className={styles.infoEmpty}>Sin dirección</span>}
                  </div>
                )}
              </div>

              {/* Cupones canjeados */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>
                  Cupones canjeados
                  <span className={styles.infoBadge}>{clientCard?.coupons?.length ?? 0}</span>
                </div>
                {!clientCard?.coupons?.length ? (
                  <div className={styles.infoEmpty}>Sin cupones</div>
                ) : (
                  <div className={styles.infoCouponList}>
                    {clientCard.coupons.slice(0, 8).map((c, i) => (
                      <div key={i} className={styles.infoCouponRow}>
                        <span className={styles.infoCouponName}>{c.couponName || c.folio || 'Cupón'}</span>
                        <span className={styles.infoCouponDate}>
                          {c.receiptDate ? new Date(c.receiptDate).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compras recientes — solo este bloque tiene scroll */}
              <div className={`${styles.infoCard} ${styles.infoCardGrow}`}>
                <div className={styles.infoCardLabel}>
                  Compras recientes
                  <span className={styles.infoBadge}>{clientCard?.receipts?.length ?? 0}</span>
                </div>
                {!clientCard?.receipts?.length ? (
                  <div className={styles.infoEmpty}>Sin compras registradas</div>
                ) : (
                  <div className={styles.infoReceiptList}>
                    {clientCard.receipts.map((r, i) => (
                      <div key={i} className={styles.infoReceiptRow}>
                        <div className={styles.infoReceiptLeft}>
                          <div className={styles.infoReceiptStore}>{r.store}</div>
                          <div className={styles.infoReceiptDate}>
                            {r.date ? new Date(r.date).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}
                          </div>
                        </div>
                        <div className={styles.infoReceiptAmount}>
                          ${Number(r.total).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      )}

      {/* ══ CUARTA COLUMNA: PUNTO DE VENTA ══ */}
      {activeChat && (
        <div className={styles.posPanel}>
          <div className={styles.posPanelHeader}>
            🛒 Punto de Venta
          </div>

          <div className={styles.posTopControls}>
            <select className={styles.posSelect} value={posOrderType} onChange={e => setPosOrderType(e.target.value)}>
              <option value="domicilio">🛵 Domicilio</option>
              <option value="llevar">🏃 Para llevar</option>
              <option value="comer">🍽️ Para comer aquí</option>
            </select>
            <select className={styles.posSelect} value={posStoreId} onChange={e => setPosStoreId(e.target.value)}>
              <option value="">— Sucursal —</option>
              {posStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {posPayTypes.length > 1 && (
              <select className={styles.posSelect} value={posPayTypeId} onChange={e => setPosPayTypeId(e.target.value)}>
                {posPayTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
              </select>
            )}
          </div>

          <div className={styles.posSearchWrap}>
            <input
              className={styles.posSearchInput}
              placeholder="Buscar producto..."
              value={posSearch}
              onChange={e => setPosSearch(e.target.value)}
            />
            {posSearch && (
              <button className={styles.posClearSearch} onClick={() => setPosSearch('')}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className={styles.posProducts}>
            {posModifierPicker ? (
              /* ── Vista de modificadores ── */
              <div className={styles.posModifierView}>
                <button className={styles.posVariantBack} onClick={() => { setPosModifierPicker(null); setPosSelectedModifiers([]); }}>
                  ← Volver
                </button>
                <div className={styles.posVariantTitle}>{posModifierPicker.item.item_name}</div>
                <div className={styles.posModifierSubtitle}>Selecciona los extras (opcional)</div>
                {posModifierPicker.modifiers.map(mod => (
                  <div key={mod.id} className={styles.posModifierGroup}>
                    <div className={styles.posModifierGroupName}>{mod.name}</div>
                    {(mod.modifier_options || []).map(opt => (
                      <label key={opt.id} className={styles.posModifierOption}>
                        <input
                          type="checkbox"
                          checked={posSelectedModifiers.includes(opt.id)}
                          onChange={e => {
                            if (e.target.checked) setPosSelectedModifiers(prev => [...prev, opt.id]);
                            else setPosSelectedModifiers(prev => prev.filter(id => id !== opt.id));
                          }}
                        />
                        <span className={styles.posModifierName}>{opt.name}</span>
                        {opt.price > 0 && (
                          <span className={styles.posModifierPrice}>+${opt.price.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
                        )}
                      </label>
                    ))}
                  </div>
                ))}
                <button className={styles.posModifierConfirmBtn} onClick={posAddItemWithModifiers}>
                  Agregar al carrito
                </button>
              </div>
            ) : posVariantPicker ? (
              /* ── Vista de variantes ── */
              <div className={styles.posVariantView}>
                <button className={styles.posVariantBack} onClick={() => setPosVariantPicker(null)}>
                  ← Volver
                </button>
                <div className={styles.posVariantTitle}>{posVariantPicker.item.item_name}</div>
                {posVariantPicker.item.variants.map(variant => {
                  const vLabel = variantName(variant);
                  let price = variant.default_price || 0;
                  if (posStoreId && variant.stores) {
                    const sp = variant.stores.find(s => s.store_id === posStoreId)?.price;
                    if (sp != null) price = sp;
                  }
                  const inCartQty = posCart.filter(c => c.variantId === variant.variant_id).reduce((s, c) => s + c.qty, 0);
                  return (
                    <div
                      key={variant.variant_id}
                      className={`${styles.posVariantOption} ${inCartQty > 0 ? styles.posVariantInCart : ''}`}
                      onClick={() => posHandleVariantSelect(posVariantPicker.item, variant)}
                    >
                      <span className={styles.posVariantName}>{vLabel || 'Estándar'}</span>
                      <span className={styles.posVariantPrice}>
                        ${price.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                      {inCartQty > 0 && <span className={styles.posVariantQtyBadge}>{inCartQty}</span>}
                    </div>
                  );
                })}
              </div>
            ) : posLoading ? (
              <div className={styles.posLoading}>Cargando productos...</div>
            ) : posFiltered.length === 0 ? (
              <div className={styles.posLoading}>{posSearch ? 'Sin resultados' : 'Sin productos'}</div>
            ) : (
              <div className={styles.posGrid}>
                {posFiltered.map(item => {
                  const hasMulti = item.variants?.length > 1;
                  const firstVariant = item.variants?.[0];
                  let price = firstVariant?.default_price || 0;
                  if (posStoreId && firstVariant?.stores) {
                    const sp = firstVariant.stores.find(s => s.store_id === posStoreId)?.price;
                    if (sp != null) price = sp;
                  }
                  const totalInCart = posCart.filter(c => c.itemId === item.id).reduce((s, c) => s + c.qty, 0);
                  return (
                    <div
                      key={item.id}
                      className={`${styles.posProductCard} ${totalInCart > 0 ? styles.posProductInCart : ''}`}
                      onClick={() => hasMulti
                        ? setPosVariantPicker({ item })
                        : posHandleVariantSelect(item, firstVariant)
                      }
                      title={item.item_name}
                    >
                      {item.image_url ? (
                        <img src={item.image_url} alt="" className={styles.posProductImg} />
                      ) : (
                        <div className={styles.posProductPlaceholder}>
                          {item.item_name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className={styles.posProductName}>{item.item_name}</div>
                      <div className={styles.posProductPrice}>
                        {hasMulti ? 'Ver variantes' : `$${price.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}
                      </div>
                      {totalInCart > 0 && <div className={styles.posProductQtyBadge}>{totalInCart}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className={styles.posCartSection}>
            <div className={styles.posCartHeader}>
              <span>Carrito</span>
              {posCart.length > 0 && (
                <button className={styles.posClearCartBtn} onClick={() => setPosCart([])}>Limpiar</button>
              )}
            </div>
            {posCart.length === 0 ? (
              <div className={styles.posCartEmpty}>Sin productos agregados</div>
            ) : (
              <div className={styles.posCartList}>
                {posCart.map((item, i) => (
                  <div key={i} className={styles.posCartRow}>
                    <div className={styles.posCartInfo}>
                      <span className={styles.posCartName}>{item.name}</span>
                      <span className={styles.posCartSubprice}>${item.price.toLocaleString('es-MX', { minimumFractionDigits: 0 })} c/u</span>
                    </div>
                    <div className={styles.posCartControls}>
                      <button className={styles.posQtyBtn} onClick={() => posUpdateQty(i, -1)}>−</button>
                      <span className={styles.posQtyNum}>{item.qty}</span>
                      <button className={styles.posQtyBtn} onClick={() => posUpdateQty(i, 1)}>+</button>
                      <span className={styles.posCartTotal}>${(item.price * item.qty).toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
                      <button className={styles.posCartRemove} onClick={() => posRemoveItem(i)}><X size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {posCart.length > 0 && (
            <div className={styles.posFooter}>
              <div className={styles.posTotalRow}>
                <span className={styles.posTotalLabel}>Total</span>
                <span className={styles.posTotalAmount}>
                  ${posTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* ── Mandar pedido a sucursal ── */}
              <button
                className={styles.posSucursalBtn}
                onClick={() => { setPosGroupPickerOpen(v => !v); setPosSelectedGroups([]); }}
              >
                📦 {posGroupPickerOpen ? 'Cancelar envío a sucursal' : 'Mandar pedido a sucursal'}
              </button>

              {posGroupPickerOpen && (
                <div className={styles.posGroupPicker}>
                  <div className={styles.posGroupPickerTitle}>Seleccionar sucursal(es)</div>
                  {pinnedGroupsData.length === 0 ? (
                    <div className={styles.posGroupPickerEmpty}>No hay grupos fijados. Fija grupos desde el panel de chats.</div>
                  ) : (
                    pinnedGroupsData.map(g => (
                      <label key={g.id} className={styles.posGroupOption}>
                        <input
                          type="checkbox"
                          className={styles.posGroupCheck}
                          checked={posSelectedGroups.includes(g.id)}
                          onChange={e => {
                            if (e.target.checked) setPosSelectedGroups(prev => [...prev, g.id]);
                            else setPosSelectedGroups(prev => prev.filter(id => id !== g.id));
                          }}
                        />
                        <span>{g.name}</span>
                      </label>
                    ))
                  )}
                  {/* ── Campo de comentarios ── */}
                  <div className={styles.posCommentWrap}>
                    <textarea
                      className={styles.posCommentInput}
                      placeholder="Agregar comentarios para la sucursal..."
                      value={posComment}
                      onChange={e => setPosComment(e.target.value)}
                      rows={2}
                    />
                  </div>
                  {pinnedGroupsData.length > 0 && (
                    <button
                      className={styles.posGroupSendBtn}
                      disabled={!posSelectedGroups.length || posSendingToGroups}
                      onClick={posSendToGroups}
                    >
                      {posSendingToGroups
                        ? 'Enviando...'
                        : `Enviar a ${posSelectedGroups.length || '―'} sucursal${posSelectedGroups.length !== 1 ? 'es' : ''}`}
                    </button>
                  )}
                </div>
              )}

              {clientCard?.client?.customerId ? (
                <div className={styles.posClientBadge}>
                  👤 {clientCard.client.name || activeChat.name}
                </div>
              ) : (
                <div className={styles.posClientBadgeNone}>Sin cliente Loyverse vinculado</div>
              )}
              <div className={styles.posActionBtns}>
                <button className={styles.posSendBtn} onClick={posSendSummary} disabled={posSending}>
                  {posSending ? 'Enviando...' : 'Enviar cliente'}
                </button>
                <button
                  className={styles.posClearOrderBtn}
                  onClick={() => { setPosCart([]); setPosModifierPicker(null); setPosVariantPicker(null); }}
                >
                  🗑 Borrar pedido
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Modal confirmación borrar chat ── */}
      {chatToDelete && (
        <div className={styles.deleteOverlay} onClick={() => !deletingChat && setChatToDelete(null)}>
          <div className={styles.deleteModal} onClick={e => e.stopPropagation()}>
            <div className={styles.deleteIconWrap}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <h3 className={styles.deleteTitle}>¿Eliminar conversación?</h3>
            <p className={styles.deleteName}>{chatToDelete.name}</p>
            <p className={styles.deleteNote}>
              Se borrará el historial completo de este chat.<br />Esta acción no se puede deshacer.
            </p>
            <div className={styles.deleteActions}>
              <button
                className={styles.deleteCancelBtn}
                onClick={() => setChatToDelete(null)}
                disabled={deletingChat}
              >
                Cancelar
              </button>
              <button
                className={styles.deleteConfirmBtn}
                onClick={confirmDeleteChat}
                disabled={deletingChat}
              >
                {deletingChat ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Gestionar Grupos ── */}
      {showGroupsModal && (
        <div className={styles.deleteOverlay} onClick={() => { setShowGroupsModal(false); setRenamingGroupId(null); }}>
          <div className={styles.groupsModal} onClick={e => e.stopPropagation()}>
            <div className={styles.groupsModalHeader}>
              <h3 className={styles.groupsModalTitle}>
                <Users size={20} /> Grupos de WhatsApp
              </h3>
              <button
                className={styles.groupsModalClose}
                onClick={() => { setShowGroupsModal(false); setRenamingGroupId(null); }}
              >
                <X size={18} />
              </button>
            </div>
            <p className={styles.groupsModalSub}>
              Fija grupos y personaliza sus nombres para tu panel
            </p>
            <div className={styles.groupsList}>
              {loadingGroups && (
                <p className={styles.groupsLoading}>Cargando grupos...</p>
              )}

              {/* ── Grupos Fijados ── */}
              {pinnedGroupsData.length > 0 && (
                <>
                  <div className={styles.groupSectionLabel}>📌 Fijados ({pinnedGroupsData.length})</div>
                  {pinnedGroupsData.map(pg => {
                    const gwGroup = gatewayGroups.find(g => g.id === pg.id);
                    const originalName = gwGroup?.name || pg.id;
                    return (
                      <div key={pg.id} className={`${styles.groupItem} ${styles.groupItemPinned}`}>
                        <div className={styles.groupInfo}>
                          <div className={styles.groupAvatar}>
                            <Avatar name={pg.name} size={40} />
                          </div>
                          <div className={styles.groupText}>
                            {renamingGroupId === pg.id ? (
                              <div className={styles.renameRow}>
                                <input
                                  className={styles.renameInput}
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter') renameGroup(pg.id, renameValue); if (e.key === 'Escape') setRenamingGroupId(null); }}
                                  autoFocus
                                  placeholder="Nombre del grupo"
                                />
                                <button className={styles.renameSaveBtn} onClick={() => renameGroup(pg.id, renameValue)}>
                                  <Check size={14} />
                                </button>
                                <button className={styles.renameCancelBtn} onClick={() => setRenamingGroupId(null)}>
                                  <X size={14} />
                                </button>
                              </div>
                            ) : (
                              <div className={styles.nameWithEdit}>
                                <span className={styles.groupName}>{pg.name}</span>
                                <button
                                  className={styles.editNameBtn}
                                  onClick={() => { setRenamingGroupId(pg.id); setRenameValue(pg.name); }}
                                  title="Renombrar grupo"
                                >
                                  <Pencil size={12} />
                                </button>
                              </div>
                            )}
                            <span className={styles.groupParticipants}>
                              {originalName !== pg.name ? `WA: ${originalName}` : pg.id}
                            </span>
                          </div>
                        </div>
                        <button
                          className={`${styles.pinBtn} ${styles.pinBtnActive}`}
                          onClick={() => togglePinGroup(pg)}
                          disabled={pinningGroup === pg.id}
                        >
                          {pinningGroup === pg.id ? '...' : '📌 Fijado'}
                        </button>
                      </div>
                    );
                  })}
                </>
              )}

              {/* ── Grupos del Gateway ── */}
              {!loadingGroups && gatewayGroups.length > 0 && (
                <>
                  <div className={styles.groupSectionLabel}>👥 Disponibles ({gatewayGroups.filter(g => !pinnedGroupIds.includes(g.id)).length})</div>
                  {gatewayGroups.filter(g => !pinnedGroupIds.includes(g.id)).map(g => (
                    <div key={g.id} className={styles.groupItem}>
                      <div className={styles.groupInfo}>
                        <div className={styles.groupAvatar}>
                          {g.picture
                            ? <img src={g.picture} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                            : <Avatar name={g.name} size={40} />
                          }
                        </div>
                        <div className={styles.groupText}>
                          <span className={styles.groupName}>{g.name}</span>
                          <span className={styles.groupParticipants}>
                            {g.participants ? `${g.participants} participantes` : g.id}
                          </span>
                        </div>
                      </div>
                      <button
                        className={styles.pinBtn}
                        onClick={() => togglePinGroup(g)}
                        disabled={pinningGroup === g.id}
                      >
                        {pinningGroup === g.id ? '...' : 'Fijar'}
                      </button>
                    </div>
                  ))}
                </>
              )}

              {!loadingGroups && gatewayGroups.length === 0 && pinnedGroupsData.length === 0 && (
                <p className={styles.groupsLoading}>No se encontraron grupos</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Alerta Nuclear de Pedido Activo ── */}
      {activeAlarms.length > 0 && (
        <div className={styles.alarmOverlay}>
          <div className={styles.alarmBox}>
            <div className={styles.alarmHeader}>
              <div className={styles.alarmRadiationIcon}>☢️</div>
              <h2 className={styles.alarmTitle}>🚨 ¡ALERTA NUCLEAR DE PEDIDO! 🚨</h2>
            </div>
            
            <p className={styles.alarmDescription}>
              Hay <strong>{activeAlarms.length}</strong> {activeAlarms.length === 1 ? 'cliente esperando' : 'clientes esperando'} atención urgente de Domicilio o Pasar por Pedido:
            </p>

            <div className={styles.alarmClientList}>
              {activeAlarms.map(c => (
                <button
                  key={c.phone}
                  className={styles.alarmClientItem}
                  onClick={() => {
                    openChat(c);
                    // Silenciar esta alerta individual
                    setDismissedAlerts(prev => ({ ...prev, [c.phone]: c.lastTs }));
                  }}
                  title="Ir al chat del cliente"
                >
                  <span className={styles.alarmClientSymbol}>🛵</span>
                  <div className={styles.alarmClientDetails}>
                    <div className={styles.alarmClientName}>{c.name}</div>
                    <div className={styles.alarmClientPhone}>{c.phone.replace(/^52/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}</div>
                  </div>
                  <span className={styles.alarmClientArrow}>➔</span>
                </button>
              ))}
            </div>

            <button
              className={styles.alarmDismissBtn}
              onClick={() => {
                // Silenciar todos los actualmente sonando
                setDismissedAlerts(prev => {
                  const next = { ...prev };
                  activeAlarms.forEach(c => {
                    next[c.phone] = c.lastTs;
                  });
                  return next;
                });
              }}
            >
              ☢️ SILENCIAR ALARMA Y ATENDER ☢️
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
