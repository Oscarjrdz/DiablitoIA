'use client';
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styles from './page.module.css';
import ErrorBoundary from './ErrorBoundary';
import ChatListPanel from './panels/ChatListPanel';
import MessagePanel from './panels/MessagePanel';
import ClientCard from './panels/ClientCard';
import POSPanel from './panels/POSPanel';
import { LRUMap, NuclearAlarm } from './_utils';

export default function ChatPage() {
  // ── Estado compartido ──
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [profilePics, setProfilePics] = useState({});
  const [isOffline, setIsOffline] = useState(false);
  const [loadingChats, setLoadingChats] = useState(true);
  const [clientCard, setClientCard] = useState(null);
  const [loadingCard, setLoadingCard] = useState(false);
  const [pinnedGroupIds, setPinnedGroupIds] = useState([]);
  const [pinnedGroupsData, setPinnedGroupsData] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [botSilent, setBotSilent] = useState(false);
  const [toast, setToast] = useState(null);
  const [dismissedAlerts, setDismissedAlerts] = useState({});

  // ── Refs ──
  const activeChatRef = useRef(null);
  const listPollRef = useRef(null);
  const msgPollRef = useRef(null);
  const sseRef = useRef(null);
  const sseConnectedRef = useRef(false);
  const tabVisibleRef = useRef(true);
  const failCountRef = useRef(0);
  const picQueueRef = useRef([]);
  const picLoadingRef = useRef(0);
  const picQueuedRef = useRef(new Set());
  const msgCacheRef = useRef(new LRUMap(100));
  const clientCacheRef = useRef(new LRUMap(50));
  const msgFetchControllerRef = useRef(null);
  const lastMsgCountRef = useRef(0);
  const lastTsRef = useRef(0);
  const alarmRef = useRef(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Foto de perfil — cola con máximo 3 concurrentes ──
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

  const queueProfilePic = useCallback((phone) => {
    if (picQueuedRef.current.has(phone)) return;
    picQueuedRef.current.add(phone);
    setProfilePics(prev => ({ ...prev, [phone]: null }));
    picQueueRef.current.push(phone);
    drainPicQueue();
  }, [drainPicQueue]);

  // ── Fetch lista de chats ──
  const fetchChats = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/chats');
      const data = await res.json();
      if (data.success) {
        setChats(prev => {
          const prevMap = new Map(prev.map(c => [c.phone, c]));
          const next = (data.chats || []).map(c => {
            const local = prevMap.get(c.phone);
            if (local && local.unread === 0 && c.unread > 0 && !c.needsHuman) return { ...c, unread: 0 };
            return local &&
              local.unread === c.unread &&
              local.needsHuman === c.needsHuman &&
              local.lastTs === c.lastTs &&
              local.lastText === c.lastText
              ? local
              : c;
          });
          if (next.length === prev.length && next.every((c, i) => c === prev[i])) return prev;
          return next;
        });
        failCountRef.current = 0;
        setIsOffline(false);
        (data.chats || []).slice(0, 20).forEach(c => queueProfilePic(c.phone));
      }
    } catch {
      failCountRef.current++;
      if (failCountRef.current >= 3) setIsOffline(true);
    }
    setLoadingChats(false);
  }, [queueProfilePic]); // eslint-disable-line

  // ── Fetch mensajes (delta-aware) ──
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
          msgCacheRef.current.set(phone, data.messages || []);
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

  const clearClientCache = useCallback((phone) => {
    clientCacheRef.current.delete(phone);
  }, []);

  // ── Fetch tarjeta de cliente ──
  const fetchClientCard = useCallback(async (phone) => {
    const cached = clientCacheRef.current.get(phone);
    if (cached) { setClientCard(cached); setLoadingCard(false); return; }
    // No limpiar clientCard — mantener layout previo visible mientras carga
    setLoadingCard(true);
    try {
      const res = await fetch(`/api/loyverse/client-card?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.success) { clientCacheRef.current.set(phone, data); setClientCard(data); }
    } catch {}
    setLoadingCard(false);
  }, []);

  // ── Abrir chat ──
  const openChat = useCallback((chat) => {
    activeChatRef.current = chat;
    setActiveChat(chat);
    setMessages(msgCacheRef.current.get(chat.phone) || []);
    setIsTyping(false);
    lastMsgCountRef.current = 0;
    lastTsRef.current = 0;
    clearInterval(msgPollRef.current);
    fetchMessages(chat.phone);
    fetchClientCard(chat.phone);
    queueProfilePic(chat.phone);
    msgPollRef.current = setInterval(() => {
      if (activeChatRef.current?.phone === chat.phone) fetchMessages(chat.phone);
    }, sseConnectedRef.current ? 10000 : 2000);
  }, [fetchMessages, fetchClientCard, queueProfilePic]);

  // ── Carga inicial + polling de lista ──
  useEffect(() => {
    fetchChats();
    listPollRef.current = setInterval(fetchChats, 3000);
    return () => clearInterval(listPollRef.current);
  }, [fetchChats]);

  // ── Cleanup del poll de mensajes al desmontar ──
  useEffect(() => () => clearInterval(msgPollRef.current), []);

  // ── SSE: notificaciones en tiempo real ──
  useEffect(() => {
    const connect = () => {
      const es = new EventSource('/api/whatsapp/sse');
      sseRef.current = es;

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.type === 'connected') {
            sseConnectedRef.current = true;
            clearInterval(listPollRef.current);
            listPollRef.current = setInterval(fetchChats, 10000);
            if (msgPollRef.current) {
              clearInterval(msgPollRef.current);
              msgPollRef.current = setInterval(() => {
                if (activeChatRef.current?.phone) fetchMessages(activeChatRef.current.phone);
              }, 10000);
            }
          } else if (data.type === 'update') {
            if (activeChatRef.current?.phone === data.phone) fetchMessages(data.phone);
            fetchChats();
          }
        } catch {}
      };

      es.onerror = () => {
        sseConnectedRef.current = false;
        es.close();
        clearInterval(listPollRef.current);
        listPollRef.current = setInterval(fetchChats, 3000);
        setTimeout(connect, 5000);
      };
    };

    connect();
    return () => { sseRef.current?.close(); sseConnectedRef.current = false; };
  }, [fetchChats, fetchMessages]);

  // ── Pausar/reanudar polls según visibilidad del tab ──
  useEffect(() => {
    const onVisibilityChange = () => {
      tabVisibleRef.current = document.visibilityState === 'visible';
      if (tabVisibleRef.current) {
        fetchChats();
        if (activeChatRef.current?.phone) fetchMessages(activeChatRef.current.phone);
        const li = sseConnectedRef.current ? 10000 : 3000;
        const mi = sseConnectedRef.current ? 10000 : 2000;
        // ← BUG FIX: limpiar el intervalo anterior antes de crear uno nuevo
        clearInterval(listPollRef.current);
        listPollRef.current = setInterval(fetchChats, li);
        clearInterval(msgPollRef.current);
        msgPollRef.current = setInterval(() => {
          if (activeChatRef.current?.phone) fetchMessages(activeChatRef.current.phone);
        }, mi);
      } else {
        clearInterval(listPollRef.current);
        clearInterval(msgPollRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [fetchChats, fetchMessages]);

  // ── Alarma Nuclear de pedidos activos ──
  const activeAlarms = useMemo(
    () => chats.filter(c => c.deliveryMode && c.needsHuman && dismissedAlerts[c.phone] !== c.lastTs),
    [chats, dismissedAlerts]
  );

  useEffect(() => {
    if (activeAlarms.length > 0) {
      if (!alarmRef.current) alarmRef.current = new NuclearAlarm();
      alarmRef.current.start();
    } else {
      alarmRef.current?.stop();
      alarmRef.current = null;
    }
    return () => { alarmRef.current?.stop(); alarmRef.current = null; };
  }, [activeAlarms]);

  useEffect(() => {
    const handleGesture = () => {
      if (activeAlarms.length > 0 && alarmRef.current) alarmRef.current.start();
    };
    document.addEventListener('click', handleGesture);
    document.addEventListener('keydown', handleGesture);
    return () => {
      document.removeEventListener('click', handleGesture);
      document.removeEventListener('keydown', handleGesture);
    };
  }, [activeAlarms]);

  // stores para ClientCard (selector de sucursal)
  const stores = useMemo(
    () => [...new Set(chats.map(c => c.store).filter(Boolean))].sort(),
    [chats]
  );

  return (
    <ErrorBoundary>
      <div className={styles.root}>

        <ChatListPanel
          chats={chats}
          setChats={setChats}
          activeChat={activeChat}
          openChat={openChat}
          profilePics={profilePics}
          isOffline={isOffline}
          loadingChats={loadingChats}
          pinnedGroupIds={pinnedGroupIds}
          setPinnedGroupIds={setPinnedGroupIds}
          pinnedGroupsData={pinnedGroupsData}
          setPinnedGroupsData={setPinnedGroupsData}
          fetchChats={fetchChats}
          showToast={showToast}
        />

        {activeChat ? (
          <MessagePanel
            activeChat={activeChat}
            setActiveChat={setActiveChat}
            setChats={setChats}
            profilePics={profilePics}
            messages={messages}
            isTyping={isTyping}
            botSilent={botSilent}
            setBotSilent={setBotSilent}
            msgPollRef={msgPollRef}
            showToast={showToast}
          />
        ) : (
          <div className={styles.emptyPane}>
            <div className={styles.emptyBox}>
              <div style={{ fontSize: 80, opacity: 0.1, marginBottom: 20 }}>💬</div>
              <h2 className={styles.emptyTitle}>Diablito Chat</h2>
              <p className={styles.emptySub}>Selecciona un chat para comenzar</p>
            </div>
          </div>
        )}

        {activeChat && (
          <ClientCard
            activeChat={activeChat}
            setChats={setChats}
            profilePics={profilePics}
            clientCard={clientCard}
            setClientCard={setClientCard}
            loadingCard={loadingCard}
            stores={stores}
            showToast={showToast}
            clearClientCache={clearClientCache}
          />
        )}

        {activeChat && (
          <POSPanel
            activeChat={activeChat}
            clientCard={clientCard}
            pinnedGroupsData={pinnedGroupsData}
            showToast={showToast}
          />
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
                      fetch('/api/whatsapp/mark-read', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: c.phone, read: true })
                      }).catch(() => {});
                      setChats(prev => prev.map(ch => ch.phone === c.phone ? { ...ch, needsHuman: false, unread: 0 } : ch));
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
                onClick={async () => {
                  setDismissedAlerts(prev => {
                    const next = { ...prev };
                    activeAlarms.forEach(c => { next[c.phone] = c.lastTs; });
                    return next;
                  });
                  const alarmsToDismiss = [...activeAlarms];
                  try {
                    await Promise.all(alarmsToDismiss.map(c =>
                      fetch('/api/whatsapp/mark-read', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: c.phone, read: true })
                      })
                    ));
                    const phones = alarmsToDismiss.map(c => c.phone);
                    setChats(prev => prev.map(c => phones.includes(c.phone) ? { ...c, needsHuman: false, unread: 0 } : c));
                    showToast('Alarmas silenciadas y atendidas en el servidor', 'success');
                  } catch { showToast('Error al guardar el estado atendido en el servidor', 'error'); }
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
    </ErrorBoundary>
  );
}
