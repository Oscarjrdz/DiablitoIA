'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Search, MoreVertical, Paperclip, Mic, Send, ArrowLeft, X, Plus, Pencil, ChevronRight, Trash2, ImagePlus } from 'lucide-react';
import { Avatar, Ticks, TypingDots, MessageBubble } from '../_atoms';
import { dayLabel, msgMatchesPending, titleCase } from '../_utils';
import styles from '../page.module.css';

export default function MessagePanel({
  activeChat,
  setActiveChat,
  setChats,
  profilePics,
  messages,
  isTyping,
  botSilent,
  setBotSilent,
  msgPollRef,
  showToast,
}) {
  const [inputText, setInputText] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [pendingMsgs, setPendingMsgs] = useState([]);
  const [vsOpen, setVsOpen] = useState(false);
  const [vsMessages, setVsMessages] = useState([]);
  const [vsEditing, setVsEditing] = useState(null);
  const [vsSending, setVsSending] = useState(null);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const virtuosoRef = useRef(null);
  const scrollerRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const typingTimerRef = useRef(null);

  // Reset al cambiar de chat
  useEffect(() => {
    setPendingMsgs([]);
    setInputText('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [activeChat?.phone]);

  // Limpiar pendientes cuando el poll confirma los mensajes
  useEffect(() => {
    if (!pendingMsgs.length) return;
    setPendingMsgs(prev => prev.filter(p => !messages.some(m => msgMatchesPending(m, p))));
  }, [messages]); // eslint-disable-line

  // Combinar mensajes reales + optimistas sin duplicados
  const allMessages = useMemo(() => {
    if (!pendingMsgs.length) return messages;
    const result = [...messages];
    for (const p of pendingMsgs) {
      if (!result.some(m => msgMatchesPending(m, p))) result.push(p);
    }
    return result;
  }, [messages, pendingMsgs]);

  // Insertar separadores de fecha y typing indicator
  const msgsWithSeps = useMemo(() => {
    const result = [];
    let lastLabel = null;
    let addedUndated = false;
    for (const m of allMessages) {
      if (!m.ts) {
        if (!addedUndated) { result.push({ _sep: true, label: 'Mensajes anteriores' }); addedUndated = true; }
        result.push(m);
        continue;
      }
      const label = dayLabel(m.ts);
      if (label && label !== lastLabel) { result.push({ _sep: true, label }); lastLabel = label; }
      result.push(m);
    }
    if (isTyping) result.push({ _typing: true });
    return result;
  }, [allMessages, isTyping]);

  // RAF doble: espera al frame donde Virtuoso ya pintó el nuevo ítem
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight + 9999;
      });
    });
  }, []);

  // Al cambiar de chat: scroll al fondo
  useEffect(() => {
    isAtBottomRef.current = true;
    scrollToBottom();
    const t1 = setTimeout(scrollToBottom, 100);
    const t2 = setTimeout(scrollToBottom, 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [activeChat?.phone, scrollToBottom]);

  // Mensajes nuevos: bajar si estamos cerca del fondo
  useEffect(() => {
    if (!msgsWithSeps.length) return;
    const el = scrollerRef.current;
    if (!el) { scrollToBottom(); return; }
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 350) scrollToBottom();
  }, [msgsWithSeps.length, scrollToBottom]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const sendTypingStatus = useCallback((phone, typing) => {
    fetch('/api/whatsapp/typing', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, typing })
    }).catch(() => {});
  }, []);

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    autoResize();
    if (!activeChat) return;
    sendTypingStatus(activeChat.phone, true);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => sendTypingStatus(activeChat.phone, false), 3000);
  };

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, read: true })
    }).catch(() => {});
    setPendingMsgs(prev => [...prev, optimistic]);
    setTimeout(scrollToBottom, 50);
    setTimeout(scrollToBottom, 300);
    fetch('/api/whatsapp/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: phone, text, attachment: optimistic.attachment, attachmentType: optimistic.attachmentType })
    }).then(r => r.json()).then(data => {
      if (!data.success) {
        showToast('Error al enviar mensaje', 'error');
        setPendingMsgs(prev => prev.filter(p => p._localId !== _localId));
      } else if (data.msgId) {
        setPendingMsgs(prev => prev.map(p => p._localId === _localId ? { ...p, msgId: data.msgId } : p));
      }
    }).catch(() => {
      showToast('Error de conexión', 'error');
      setPendingMsgs(prev => prev.filter(p => p._localId !== _localId));
    });
  }, [inputText, attachment, activeChat, sendTypingStatus, showToast, setChats, scrollToBottom]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Venta Sugestiva ──
  const fetchVsMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/suggestive-messages');
      const data = await res.json();
      if (data.success) setVsMessages(data.messages || []);
    } catch {}
  }, []);

  useEffect(() => { fetchVsMessages(); }, [fetchVsMessages]);

  const vsSend = useCallback(async (msg) => {
    if (!activeChat || vsSending) return;
    setVsSending(msg.id);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: activeChat.phone, text: msg.text,
          attachment: msg.image || null,
          attachmentType: msg.image ? 'image' : null
        })
      });
      const data = await res.json();
      if (data.success) {
        setVsOpen(false);
        fetch('/api/whatsapp/mark-read', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: activeChat.phone, read: true })
        }).catch(() => {});
        setChats(prev => prev.map(c => c.phone === activeChat.phone
          ? { ...c, lastText: msg.text, lastTs: Date.now(), fromMe: true, needsHuman: false, unread: 0 }
          : c));
      } else {
        showToast('Error al enviar', 'error');
      }
    } catch { showToast('Error de conexión', 'error'); }
    setVsSending(null);
  }, [activeChat, vsSending, setChats, showToast]);

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

  return (
    <div className={styles.right}>

      {/* Header */}
      <div className={styles.rightHeader}>
        <button className={styles.backBtn} onClick={() => {
          setActiveChat(null);
          clearInterval(msgPollRef.current);
        }}>
          <ArrowLeft size={22} />
        </button>
        <Avatar name={activeChat.name} phone={activeChat.phone} size={40} picUrl={profilePics[activeChat.phone]} />
        <div className={styles.headerInfo}>
          <span className={styles.headerName}>{titleCase(activeChat.name)}</span>
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
                method: 'POST', headers: { 'Content-Type': 'application/json' },
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

      {/* Lista de mensajes */}
      <Virtuoso
        ref={virtuosoRef}
        scrollerRef={(el) => { scrollerRef.current = el; }}
        className={styles.messages}
        style={{ overflowX: 'hidden' }}
        data={msgsWithSeps}
        overscan={10}
        atBottomStateChange={(atBottom) => { isAtBottomRef.current = atBottom; }}
        atBottomThreshold={120}
        contentContainerStyle={{ paddingTop: 12 }}
        components={{ Footer: () => <div style={{ height: 20 }} /> }}
        computeItemKey={(index, item) =>
          item._sep ? `sep-${index}` :
          item._typing ? 'typing' :
          item.msgId || (item.ts ? `${item.ts}_${item.fromMe ? 'o' : 'i'}` : `f${index}`)
        }
        itemContent={(index, item) => {
          if (item._sep) return <div className={styles.dateSep}><span>{item.label}</span></div>;
          if (item._typing) {
            return (
              <div className={styles.rowIn}>
                <Avatar name={activeChat.name} phone={activeChat.phone} size={28} picUrl={profilePics[activeChat.phone]} />
                <div className={styles.bubbleIn} style={{ padding: '10px 14px' }}>
                  <TypingDots />
                </div>
              </div>
            );
          }
          return (
            <MessageBubble
              m={item}
              chatName={activeChat.name}
              chatPhone={activeChat.phone}
              picUrl={profilePics[activeChat.phone]}
            />
          );
        }}
      />

      {/* Preview del adjunto */}
      {attachment && (
        <div className={styles.attachBar}>
          {attachment.type === 'image'
            ? <img src={attachment.base64} alt="" style={{ height: 72, borderRadius: 6, objectFit: 'cover' }} />
            : <div className={styles.filePreview}><Paperclip size={15} /> {attachment.name}</div>
          }
          <button className={styles.removeAttach} onClick={clearAttachment}><X size={13} /></button>
        </div>
      )}

      {/* Input row */}
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

      {/* Modal Venta Sugestiva */}
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
  );
}
