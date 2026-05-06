'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';
import { Search, MoreVertical, Paperclip, Mic, Send, ArrowLeft, X, Check } from 'lucide-react';

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

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeChatRef = useRef(null);
  const msgPollRef = useRef(null);
  const listPollRef = useRef(null);
  const typingTimerRef = useRef(null);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // ── Cargar lista de chats ──
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      const data = await res.json();
      if (data.success) {
        setChats(data.chats || []);
        // Cargar fotos de perfil en background para los primeros 20
        const toLoad = (data.chats || []).slice(0, 20);
        toLoad.forEach(c => {
          if (!profilePics[c.phone]) fetchProfilePic(c.phone);
        });
      }
    } catch {}
    setLoadingChats(false);
  }, []); // eslint-disable-line

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

  // ── Cargar mensajes del chat activo ──
  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/whatsapp/history?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.messages || []);
        setIsTyping(!!data.isTyping);
        setChats(prev => prev.map(c => c.phone === phone ? { ...c, unread: 0 } : c));
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

  const openChat = useCallback((chat) => {
    setActiveChat(chat);
    setMessages([]);
    setIsTyping(false);
    setInputText('');
    setAttachment(null);
    clearInterval(msgPollRef.current);
    fetchMessages(chat.phone);
    fetchClientCard(chat.phone);
    // Cargar foto si no la tenemos
    if (!profilePics[chat.phone]) fetchProfilePic(chat.phone);
    msgPollRef.current = setInterval(() => {
      if (activeChatRef.current?.phone === chat.phone) fetchMessages(chat.phone);
    }, 2000);
  }, [fetchMessages, fetchProfilePic, fetchClientCard, profilePics]);

  useEffect(() => () => clearInterval(msgPollRef.current), []);

  useEffect(() => {
    if (messages.length) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
        ? { ...c, lastText: text || '📎 Archivo', lastTs: now, fromMe: true }
        : c
    ));
    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeChat.phone, text, attachment: attachment?.base64 || null, attachmentType: attachment?.type || null })
      });
    } catch {}
  }, [inputText, attachment, activeChat, sendTypingStatus]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Filtrar chats ──
  const filtered = search
    ? chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))
    : chats;

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

        <div className={styles.leftHeader}>
          <Avatar name="El Diablito" size={40} />
          <span className={styles.leftTitle}>Chats</span>
          <div className={styles.headerIconsLeft}>
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

        <div className={styles.chatList}>
          {loadingChats && <p className={styles.tip}>Cargando chats...</p>}
          {!loadingChats && filtered.length === 0 && <p className={styles.tip}>Sin chats aún</p>}
          {filtered.map(chat => (
            <div
              key={chat.phone}
              className={`${styles.chatItem} ${activeChat?.phone === chat.phone ? styles.chatActive : ''}`}
              onClick={() => openChat(chat)}
            >
              <Avatar name={chat.name} phone={chat.phone} size={49} picUrl={profilePics[chat.phone]} />
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
                  {chat.unread > 0 && <span className={styles.badge}>{chat.unread > 99 ? '99+' : chat.unread}</span>}
                </div>
              </div>
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
              <Search size={20} />
              <MoreVertical size={20} />
            </div>
          </div>

          <div className={styles.messages}>
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
                    {m.attachment && m.attachmentType === 'image' && (
                      <img src={m.attachment} alt="" style={{ maxWidth: '100%', borderRadius: 6, display: 'block', marginBottom: 4 }} />
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
          ) : clientCard ? (
            <div className={styles.infoScroll}>

              {/* Avatar + nombre */}
              <div className={styles.infoAvatar}>
                <Avatar name={clientCard.client.name} phone={clientCard.client.phone} size={64} picUrl={profilePics[activeChat.phone]} />
                <div className={styles.infoName}>{clientCard.client.name}</div>
                <div className={styles.infoPhone}>
                  {clientCard.client.phone10.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}
                </div>
                {clientCard.client.tienda && (
                  <div className={styles.infoStore}>{clientCard.client.tienda}</div>
                )}
                {clientCard.client.duplicateRecords && (
                  <div className={styles.infoDuplicateWarn}>
                    ⚠️ {clientCard.client.loyverseRecords} registros en Loyverse — puntos y compras sumados
                  </div>
                )}
              </div>

              {/* Puntos */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>Puntos acumulados</div>
                <div className={styles.infoPoints}>
                  {clientCard.client.points !== null
                    ? Number(clientCard.client.points).toLocaleString('es-MX')
                    : <span style={{ fontSize: 14, color: '#525d65' }}>No en Loyverse</span>
                  }
                </div>
              </div>

              {/* Dirección */}
              {clientCard.client.address && (
                <div className={styles.infoCard}>
                  <div className={styles.infoCardLabel}>Dirección</div>
                  <div className={styles.infoAddress}>{clientCard.client.address}</div>
                </div>
              )}

              {/* Cupones canjeados */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>
                  Cupones canjeados
                  <span className={styles.infoBadge}>{clientCard.coupons.length}</span>
                </div>
                {clientCard.coupons.length === 0 ? (
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

              {/* Compras recientes */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardLabel}>
                  Compras recientes
                  <span className={styles.infoBadge}>{clientCard.receipts.length}</span>
                </div>
                {clientCard.receipts.length === 0 ? (
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
          ) : (
            <div className={styles.infoEmpty} style={{ padding: '2rem', textAlign: 'center' }}>
              Cliente no encontrado<br />en Loyverse
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

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
