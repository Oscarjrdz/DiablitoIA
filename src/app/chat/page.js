'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';
import { Search, MoreVertical, Paperclip, Mic, Send, ArrowLeft, X, CheckCheck } from 'lucide-react';

// ── Avatar con iniciales y color consistente ──
const AVATAR_COLORS = [
  '#e53935','#d81b60','#8e24aa','#5e35b1','#1e88e5',
  '#039be5','#00acc1','#00897b','#43a047','#c0ca33',
  '#f4511e','#f09300'
];

function hashColor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name = '', phone = '', size = 49 }) {
  const key = name || phone;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: hashColor(key), flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.37),
      letterSpacing: 0.5, userSelect: 'none'
    }}>
      {initials(name || phone.slice(-4))}
    </div>
  );
}

// ── Formato de tiempo relativo para la lista ──
function relativeTime(ts) {
  if (!ts) return '';
  const now = new Date();
  const d = new Date(ts);
  const toLocal = x => x.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  const nowStr = toLocal(now);
  const dStr = toLocal(d);
  if (nowStr === dStr)
    return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dStr === toLocal(yesterday)) return 'Ayer';
  if (now - d < 7 * 86400000) return ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()];
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ── Separador de fecha en el área de mensajes ──
function dateSeparator(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const toLocal = x => x.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
  if (toLocal(d) === toLocal(now)) return 'Hoy';
  const yest = new Date(now); yest.setDate(yest.getDate() - 1);
  if (toLocal(d) === toLocal(yest)) return 'Ayer';
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Monterrey' });
}

export default function ChatPage() {
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [search, setSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [attachment, setAttachment] = useState(null); // { base64, type, name }

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const activeChatRef = useRef(null);
  const msgPollRef = useRef(null);
  const listPollRef = useRef(null);

  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // ── Cargar lista de chats ──
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      const data = await res.json();
      if (data.success) setChats(data.chats || []);
    } catch {}
    setLoadingChats(false);
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
        // Actualizar badge de unread en la lista
        setChats(prev => prev.map(c => c.phone === phone ? { ...c, unread: 0 } : c));
      }
    } catch {}
  }, []);

  const openChat = useCallback((chat) => {
    setActiveChat(chat);
    setMessages([]);
    setInputText('');
    setAttachment(null);
    clearInterval(msgPollRef.current);
    fetchMessages(chat.phone);
    msgPollRef.current = setInterval(() => {
      if (activeChatRef.current?.phone === chat.phone) fetchMessages(chat.phone);
    }, 2000);
  }, [fetchMessages]);

  useEffect(() => () => clearInterval(msgPollRef.current), []);

  // ── Auto-scroll al último mensaje ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Auto-resize del textarea ──
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
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
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text && !attachment) return;
    if (!activeChat) return;

    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('es-MX', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey'
    });

    // Optimistic UI
    const optimistic = {
      text,
      attachment: attachment?.base64 || null,
      attachmentType: attachment?.type || null,
      fromMe: true,
      ts: now,
      time: timeStr
    };
    setMessages(prev => [...prev, optimistic]);
    setInputText('');
    clearAttachment();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Actualizar preview en la lista
    setChats(prev => prev.map(c =>
      c.phone === activeChat.phone
        ? { ...c, lastText: text || '📎 Archivo', lastTs: now, fromMe: true }
        : c
    ));

    try {
      await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChat.phone,
          text,
          attachment: attachment?.base64 || null,
          attachmentType: attachment?.type || null
        })
      });
    } catch {}
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Filtrar chats ──
  const filtered = search
    ? chats.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search)
      )
    : chats;

  // ── Separadores de fecha en mensajes ──
  const msgsWithSeparators = [];
  let lastDateLabel = null;
  for (const m of messages) {
    const label = dateSeparator(m.ts);
    if (label && label !== lastDateLabel) {
      msgsWithSeparators.push({ _sep: true, label });
      lastDateLabel = label;
    }
    msgsWithSeparators.push(m);
  }

  return (
    <div className={styles.root}>

      {/* ══ PANEL IZQUIERDO ══ */}
      <div className={`${styles.left} ${activeChat ? styles.leftHidden : ''}`}>
        <div className={styles.leftHeader}>
          <Avatar name="El Diablito" size={40} />
          <span className={styles.leftTitle}>Chats</span>
          <MoreVertical size={20} color="#aebac1" style={{ cursor: 'pointer' }} />
        </div>

        <div className={styles.searchBar}>
          <Search size={15} color="#8696a0" />
          <input
            className={styles.searchInput}
            placeholder="Buscar o empezar chat"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button style={{ background: 'none', border: 'none', color: '#8696a0', cursor: 'pointer', padding: 0 }} onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>

        <div className={styles.chatList}>
          {loadingChats && <p className={styles.tip}>Cargando chats...</p>}
          {!loadingChats && filtered.length === 0 && <p className={styles.tip}>Sin chats</p>}
          {filtered.map(chat => (
            <div
              key={chat.phone}
              className={`${styles.chatItem} ${activeChat?.phone === chat.phone ? styles.chatActive : ''}`}
              onClick={() => openChat(chat)}
            >
              <Avatar name={chat.name} phone={chat.phone} size={49} />
              <div className={styles.chatMeta}>
                <div className={styles.chatRow1}>
                  <span className={styles.chatName}>{chat.name}</span>
                  <span className={styles.chatTime}>{relativeTime(chat.lastTs)}</span>
                </div>
                <div className={styles.chatRow2}>
                  <span className={styles.chatPreview}>
                    {chat.fromMe && <CheckCheck size={14} color="#8696a0" style={{ marginRight: 3, verticalAlign: 'middle', flexShrink: 0 }} />}
                    {chat.lastText || <em style={{ opacity: 0.5 }}>Sin mensajes</em>}
                  </span>
                  {chat.unread > 0 && <span className={styles.badge}>{chat.unread}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ PANEL DERECHO ══ */}
      {activeChat ? (
        <div className={styles.right}>
          {/* Header */}
          <div className={styles.rightHeader}>
            <button className={styles.backBtn} onClick={() => { setActiveChat(null); clearInterval(msgPollRef.current); }}>
              <ArrowLeft size={22} />
            </button>
            <Avatar name={activeChat.name} phone={activeChat.phone} size={40} />
            <div className={styles.headerInfo}>
              <span className={styles.headerName}>{activeChat.name}</span>
              <span className={styles.headerSub}>{activeChat.phone.replace(/^52/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}</span>
            </div>
            <div className={styles.headerIcons}>
              <Search size={20} />
              <MoreVertical size={20} />
            </div>
          </div>

          {/* Mensajes */}
          <div className={styles.messages}>
            {msgsWithSeparators.map((item, i) => {
              if (item._sep) {
                return (
                  <div key={'sep' + i} className={styles.dateSep}>
                    <span>{item.label}</span>
                  </div>
                );
              }
              const m = item;
              return (
                <div key={i} className={m.fromMe ? styles.rowOut : styles.rowIn}>
                  {!m.fromMe && <Avatar name={activeChat.name} phone={activeChat.phone} size={28} />}
                  <div className={m.fromMe ? styles.bubbleOut : styles.bubbleIn}>
                    {m.attachment && m.attachmentType === 'image' && (
                      <img src={m.attachment} alt="" style={{ maxWidth: '100%', borderRadius: 6, display: 'block', marginBottom: 4 }} />
                    )}
                    {m.attachment && m.attachmentType !== 'image' && (
                      <div className={styles.fileAttach}>
                        <Paperclip size={16} />
                        <span>Archivo adjunto</span>
                      </div>
                    )}
                    {m.text && <span className={styles.msgText}>{m.text}</span>}
                    <div className={styles.msgMeta}>
                      {m.time && <span className={styles.msgTime}>{m.time}</span>}
                      {m.fromMe && <CheckCheck size={14} color="#8696a0" />}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Preview adjunto */}
          {attachment && (
            <div className={styles.attachBar}>
              {attachment.type === 'image'
                ? <img src={attachment.base64} alt="" style={{ height: 72, borderRadius: 6, objectFit: 'cover' }} />
                : <div className={styles.filePreview}><Paperclip size={16} />{attachment.name}</div>
              }
              <button className={styles.removeAttach} onClick={clearAttachment}><X size={14} /></button>
            </div>
          )}

          {/* Input */}
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
                onChange={e => { setInputText(e.target.value); autoResize(); }}
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
            <div style={{ fontSize: 72, marginBottom: 16, opacity: 0.12 }}>💬</div>
            <h2 className={styles.emptyTitle}>Diablito Chat</h2>
            <p className={styles.emptySub}>Selecciona un chat para comenzar a escribir</p>
          </div>
        </div>
      )}
    </div>
  );
}
