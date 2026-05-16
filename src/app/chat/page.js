'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from './page.module.css';
import { Search, MoreVertical, Paperclip, Mic, Send, ArrowLeft, X, Check, Plus, Phone, User, Users, Pencil } from 'lucide-react';

// ── Avatar con iniciales y color consistente ──
const AVATAR_COLORS = [
  '#e53935','#d81b60','#8e24aa','#5e35b1','#1e88e5',
  '#039be5','#00acc1','#00897b','#43a047','#7cb342',
  '#f4511e','#f09300'
];
function hashColor(s = '') {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name = '') {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0][0].toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function Avatar({ name = '', phone = '', size = 49, picUrl = null }) {
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
}

// ── Palomitas dinámicas ──
function Ticks({ status }) {
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
}

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

// ── Animación de tres puntos (typing) ──
function TypingDots() {
  return (
    <span className={styles.typingDots}>
      <span /><span /><span />
    </span>
  );
}

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
  const [posSubmitting, setPosSubmitting] = useState(false);

  // New chat
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);

  // Groups management
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [gatewayGroups, setGatewayGroups] = useState([]);
  const [pinnedGroupIds, setPinnedGroupIds] = useState([]);
  const [pinnedGroupsData, setPinnedGroupsData] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [pinningGroup, setPinningGroup] = useState(null);
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

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
  const posDataLoadedRef = useRef(false);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

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
        setChats(data.chats || []);
        failCountRef.current = 0;
        setIsOffline(false);
        // Queue profile pics (max 3 concurrent)
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
    setProfilePics(prev => {
      if (prev[phone] !== undefined) return prev; // already loaded or loading
      return { ...prev, [phone]: null }; // mark as queued
    });
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

  const fetchProfilePic = useCallback(async (phone) => {
    try {
      const res = await fetch(`/api/whatsapp/profile-pic?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      setProfilePics(prev => ({ ...prev, [phone]: data.url || null }));
    } catch {}
  }, []);

  useEffect(() => {
    fetchChats();
    listPollRef.current = setInterval(fetchChats, 8000);
    return () => clearInterval(listPollRef.current);
  }, [fetchChats]);

  // ── Cargar mensajes del chat activo (delta-aware) ──
  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/whatsapp/history?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) {
        // Only update if message count or last timestamp changed (delta check)
        if (data.msgCount !== lastMsgCountRef.current || data.lastTs !== lastTsRef.current) {
          setMessages(data.messages || []);
          lastMsgCountRef.current = data.msgCount || 0;
          lastTsRef.current = data.lastTs || 0;
        }
        setIsTyping(!!data.isTyping);
        setBotSilent(!!data.botSilent);
      }
    } catch {}
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
  }, [clientCard, editAddress, editStore]);

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
        if (data.paymentTypes?.length) setPosPayTypeId(data.paymentTypes[0].id);
      }
    } catch {}
    setPosLoading(false);
  }, []);

  const openChat = useCallback((chat) => {
    setActiveChat(chat);
    setMessages([]);
    setIsTyping(false);
    setInputText('');
    setAttachment(null);
    lastMsgCountRef.current = 0;
    lastTsRef.current = 0;
    clearInterval(msgPollRef.current);
    fetchMessages(chat.phone);
    fetchClientCard(chat.phone);
    // Clear unread badge once on open
    setChats(prev => prev.map(c => c.phone === chat.phone ? { ...c, unread: 0 } : c));
    fetch(`/api/whatsapp/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: chat.phone, read: false })
    }).catch(() => {});
    // Reset unread counter in Redis
    fetch(`/api/whatsapp/history?phone=${encodeURIComponent(chat.phone)}&clearUnread=1`).catch(() => {});
    // Load profile pic if needed
    if (!profilePics[chat.phone]) fetchProfilePic(chat.phone);
    fetchPOSData();
    msgPollRef.current = setInterval(() => {
      if (activeChatRef.current?.phone === chat.phone) fetchMessages(chat.phone);
    }, 2000);
  }, [fetchMessages, fetchProfilePic, fetchClientCard, profilePics, fetchPOSData]);

  useEffect(() => () => clearInterval(msgPollRef.current), []);

  // ── Smart scroll: only auto-scroll when user is at bottom ──
  const messagesContainerRef = useRef(null);
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (messages.length && isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [messages]);

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

  // ── Toast helper ──
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

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
        c.phone === phone ? { ...c, needsHuman: !currentlyNeedsHuman } : c
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
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text && !attachment) return;
    if (!activeChat) return;
    clearTimeout(typingTimerRef.current);
    sendTypingStatus(activeChat.phone, false);
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey'
    });
    const optimistic = {
      text, attachment: attachment?.base64 || null,
      attachmentType: attachment?.type || null,
      fromMe: true, ts: now, time: timeStr, status: 'sent'
    };
    setMessages(prev => [...prev, optimistic]);
    setInputText('');
    clearAttachment();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setChats(prev => prev.map(c =>
      c.phone === activeChat.phone
        ? { ...c, lastText: text || '📎 Archivo', lastTs: now, fromMe: true, needsHuman: false }
        : c
    ));
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeChat.phone, text, attachment: attachment?.base64 || null, attachmentType: attachment?.type || null })
      });
      const data = await res.json();
      if (!data.success) {
        // Mark optimistic message as failed
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 && m.ts === now ? { ...m, status: 'error' } : m));
        showToast('Error al enviar mensaje', 'error');
      }
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 && m.ts === now ? { ...m, status: 'error' } : m));
      showToast('Error de conexión', 'error');
    }
  }, [inputText, attachment, activeChat, sendTypingStatus]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── POS helpers ──
  const posAddItem = useCallback((item) => {
    const variant = item.variants?.[0];
    let price = variant?.default_price || 0;
    if (posStoreId && variant?.stores) {
      const sp = variant.stores.find(s => s.store_id === posStoreId)?.price;
      if (sp != null) price = sp;
    }
    const variantId = variant?.variant_id;
    setPosCart(prev => {
      const idx = prev.findIndex(c => c.itemId === item.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { itemId: item.id, variantId, name: item.item_name, price, qty: 1 }];
    });
  }, [posStoreId]);

  const posUpdateQty = useCallback((idx, delta) => {
    setPosCart(prev => prev.map((c, i) => i === idx ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
  }, []);

  const posRemoveItem = useCallback((idx) => {
    setPosCart(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const posTotal = useMemo(() => posCart.reduce((sum, c) => sum + c.price * c.qty, 0), [posCart]);

  const posFiltered = useMemo(
    () => posItems
      .filter(item => !posSearch || item.item_name.toLowerCase().includes(posSearch.toLowerCase()))
      .sort((a, b) => a.item_name.localeCompare(b.item_name, 'es')),
    [posItems, posSearch]
  );

  const posSendSummary = useCallback(async () => {
    if (!posCart.length || !activeChat) return;
    const storeName = posStores.find(s => s.id === posStoreId)?.name || '';
    const lines = posCart.map(c =>
      `• ${c.name} x${c.qty} — $${(c.price * c.qty).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    ).join('\n');
    const text = `🛒 *Resumen de tu pedido:*\n\n${lines}\n\n*Total: $${posTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*${storeName ? `\n\nSucursal: ${storeName}` : ''}`;
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
  }, [posCart, posStoreId, posStores, posTotal, activeChat]);

  const posCreateReceipt = useCallback(async () => {
    if (!posCart.length || !posStoreId || posSubmitting) return;
    setPosSubmitting(true);
    try {
      const res = await fetch('/api/loyverse/pos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: posStoreId,
          line_items: posCart.map(c => ({ item_id: c.itemId, variant_id: c.variantId, quantity: c.qty, price: c.price })),
          payment_type_id: posPayTypeId,
          total: posTotal
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Ticket creado en Loyverse ✅', 'success');
        setPosCart([]);
      } else {
        const errMsg = data.error?.details || data.error?.message || JSON.stringify(data.error) || 'Error desconocido';
        showToast(`Error: ${errMsg}`, 'error');
      }
    } catch {
      showToast('Error de conexión', 'error');
    }
    setPosSubmitting(false);
  }, [posCart, posStoreId, posPayTypeId, posTotal, posSubmitting]);

  // ── Lista de sucursales únicas (de los chats cargados) ──
  const stores = [...new Set(chats.map(c => c.store).filter(Boolean))].sort();

  // ── Filtrar chats por búsqueda y/o sucursal ──
  const filtered = chats.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchStore = !storeFilter || c.store === storeFilter;
    return matchSearch && matchStore;
  });

  // ── Inyectar separadores de fecha en mensajes ──
  const msgsWithSeps = [];
  let lastLabel = null;
  let addedUndated = false;
  for (const m of messages) {
    if (!m.ts) {
      if (!addedUndated) {
        msgsWithSeps.push({ _sep: true, label: 'Mensajes anteriores' });
        addedUndated = true;
      }
      msgsWithSeps.push(m);
      continue;
    }
    const label = dayLabel(m.ts);
    if (label && label !== lastLabel) {
      msgsWithSeps.push({ _sep: true, label });
      lastLabel = label;
    }
    msgsWithSeps.push(m);
  }

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
            onClick={() => setShowNewChat(!showNewChat)}
          >
            <Plus size={16} />
            <span>Agregar Chat</span>
            {showNewChat && <X size={14} style={{ marginLeft: 'auto' }} />}
          </button>

          {showNewChat && (
            <div className={styles.newChatForm}>
              <div className={styles.newChatInputRow}>
                <Phone size={16} color="#8696a0" />
                <input
                  className={styles.newChatInput}
                  placeholder="Número WhatsApp (ej: 8112345678)"
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value.replace(/\D/g, ''))}
                  maxLength={10}
                />
              </div>
              <div className={styles.newChatInputRow}>
                <User size={16} color="#8696a0" />
                <input
                  className={styles.newChatInput}
                  placeholder="Nombre del contacto"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                />
              </div>
              <button
                className={styles.newChatBtn}
                disabled={creatingChat || newPhone.length < 10}
                onClick={async () => {
                  setCreatingChat(true);
                  try {
                    const cleanPhone = '52' + newPhone.slice(-10);
                    // Check if chat already exists
                    const existing = chats.find(c => c.phone === cleanPhone);
                    if (existing) {
                      openChat(existing);
                      setShowNewChat(false);
                      setNewPhone('');
                      setNewName('');
                      showToast('Chat ya existe, abriendo...');
                      setCreatingChat(false);
                      return;
                    }
                    // Create in Redis
                    await fetch('/api/whatsapp/create-chat', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ phone: cleanPhone, name: newName.trim() })
                    });
                    const newChat = {
                      phone: cleanPhone,
                      name: newName.trim() || newPhone.slice(-10),
                      lastText: '',
                      lastTs: Date.now(),
                      fromMe: false,
                      unread: 0,
                      msgCount: 0,
                      store: '',
                      needsHuman: false
                    };
                    setChats(prev => [newChat, ...prev]);
                    openChat(newChat);
                    setShowNewChat(false);
                    setNewPhone('');
                    setNewName('');
                    showToast('Chat creado');
                  } catch {
                    showToast('Error al crear chat', 'error');
                  }
                  setCreatingChat(false);
                }}
              >
                <Plus size={16} />
                {creatingChat ? 'Creando...' : 'Crear Chat'}
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
                <div key={i} className={m.fromMe ? styles.rowOut : styles.rowIn}>
                  {!m.fromMe && (
                    <Avatar name={activeChat.name} phone={activeChat.phone} size={28} picUrl={profilePics[activeChat.phone]} />
                  )}
                  <div className={m.fromMe ? styles.bubbleOut : styles.bubbleIn}>
                    {/* Image from base64 (manual send) */}
                    {m.attachment && m.attachmentType === 'image' && (
                      <img src={m.attachment} alt="" style={{ maxWidth: '100%', borderRadius: 6, display: 'block', marginBottom: 4 }} />
                    )}
                    {/* Image from URL (coupon/promo) */}
                    {!m.attachment && m.attachmentUrl && m.attachmentType === 'image' && (
                      <img src={m.attachmentUrl} alt="Cupón" style={{ maxWidth: '100%', borderRadius: 6, display: 'block', marginBottom: 4 }} />
                    )}
                    {m.attachment && m.attachmentType !== 'image' && (
                      <div className={styles.fileAttach}>
                        <Paperclip size={14} />
                        <span>Archivo adjunto</span>
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
            {posLoading ? (
              <div className={styles.posLoading}>Cargando productos...</div>
            ) : posFiltered.length === 0 ? (
              <div className={styles.posLoading}>{posSearch ? 'Sin resultados' : 'Sin productos'}</div>
            ) : (
              <div className={styles.posGrid}>
                {posFiltered.map(item => {
                  const variant = item.variants?.[0];
                  let price = variant?.default_price || 0;
                  if (posStoreId && variant?.stores) {
                    const sp = variant.stores.find(s => s.store_id === posStoreId)?.price;
                    if (sp != null) price = sp;
                  }
                  const inCart = posCart.find(c => c.itemId === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`${styles.posProductCard} ${inCart ? styles.posProductInCart : ''}`}
                      onClick={() => posAddItem(item)}
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
                        ${price.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </div>
                      {inCart && <div className={styles.posProductQtyBadge}>{inCart.qty}</div>}
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
              <div className={styles.posActionBtns}>
                <button className={styles.posSendBtn} onClick={posSendSummary} disabled={posSubmitting}>
                  Enviar cliente
                </button>
                <button
                  className={styles.posTicketBtn}
                  onClick={posCreateReceipt}
                  disabled={!posStoreId || posSubmitting}
                  title={!posStoreId ? 'Selecciona una sucursal primero' : ''}
                >
                  {posSubmitting ? '...' : 'Crear ticket'}
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

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
