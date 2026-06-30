'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Search, MoreVertical, Plus, X, Phone, User, Users, Pencil, Check } from 'lucide-react';
import { ChatRow, Avatar } from '../_atoms';
import styles from '../page.module.css';

function ChatListPanel({
  chats,
  setChats,
  activeChat,
  openChat,
  profilePics,
  isOffline,
  shopOffline,
  toggleShopMode,
  loadingChats,
  pinnedGroupIds,
  setPinnedGroupIds,
  pinnedGroupsData,
  setPinnedGroupsData,
  fetchChats,
  queueProfilePic,
  loadMoreChats,
  loadingMoreChats,
  hasMoreChats,
  chatTotal,
  showToast,
}) {
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [unreadFilter, setUnreadFilter] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('chat_unread_filter') === '1'
  );
  const [hideGroups, setHideGroups] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem('chat_hide_groups') === '1'
  );

  // Nuevo chat
  const [showNewChat, setShowNewChat] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);
  const [newPhoneLoyverse, setNewPhoneLoyverse] = useState(null);
  const [newPhoneSearching, setNewPhoneSearching] = useState(false);

  // Borrar chat
  const [chatToDelete, setChatToDelete] = useState(null);
  const [deletingChat, setDeletingChat] = useState(false);

  // Grupos
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [gatewayGroups, setGatewayGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [pinningGroup, setPinningGroup] = useState(null);
  const [renamingGroupId, setRenamingGroupId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const stores = useMemo(
    () => [...new Set(chats.map(c => c.store).filter(Boolean))].sort(),
    [chats]
  );

  const filtered = useMemo(() => chats.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search);
    const matchStore = !storeFilter || c.store === storeFilter;
    const matchUnread = !unreadFilter || c.unread > 0 || c.isGroup;
    const matchGroup = !hideGroups || !c.isGroup;
    return matchSearch && matchStore && matchUnread && matchGroup;
  }), [chats, search, storeFilter, unreadFilter, hideGroups]);

  const toggleHumanRead = useCallback(async (phone, currentlyNeedsHuman) => {
    try {
      await fetch('/api/whatsapp/mark-read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, read: currentlyNeedsHuman })
      });
      setChats(prev => prev.map(c =>
        c.phone === phone
          ? { ...c, needsHuman: !currentlyNeedsHuman, ...(currentlyNeedsHuman ? { unread: 0 } : {}) }
          : c
      ));
      showToast(currentlyNeedsHuman ? 'Marcado como leído' : 'Marcado como no leído', 'success');
    } catch { showToast('Error al actualizar', 'error'); }
  }, [setChats, showToast]);

  const markAllRead = useCallback(async () => {
    const toRead = chats.filter(c => !c.isGroup && c.unread > 0);
    if (!toRead.length) return;
    setChats(prev => prev.map(c => c.isGroup ? c : { ...c, unread: 0, needsHuman: false }));
    await Promise.all(toRead.map(c =>
      fetch('/api/whatsapp/mark-read', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: c.phone, read: true })
      })
    ));
    showToast('Todos los chats marcados como leídos', 'success');
  }, [chats, setChats, showToast]);

  const confirmDeleteChat = async () => {
    if (!chatToDelete) return;
    setDeletingChat(true);
    try {
      const res = await fetch(`/api/whatsapp/chats?phone=${encodeURIComponent(chatToDelete.phone)}`, { method: 'DELETE' });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.phone !== chatToDelete.phone));
        showToast(`Chat de ${chatToDelete.name} eliminado.`, 'success');
      } else {
        showToast('Error al eliminar el chat.', 'error');
      }
    } catch { showToast('Error de conexión.', 'error'); }
    finally { setDeletingChat(false); setChatToDelete(null); }
  };

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
  }, [setPinnedGroupIds, setPinnedGroupsData]);

  // Cargar grupos al montar para que pinnedGroupsData esté disponible en POSPanel
  useEffect(() => { fetchGroups(); }, [fetchGroups]);

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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: group.id, groupName: group.name })
        });
        setPinnedGroupIds(prev => [...prev, group.id]);
        setPinnedGroupsData(prev => [...prev, { id: group.id, name: group.name }]);
        showToast(`${group.name} fijado ✅`, 'success');
      }
      fetchChats();
    } catch { showToast('Error al actualizar grupo', 'error'); }
    setPinningGroup(null);
  }, [pinnedGroupIds, fetchChats, setPinnedGroupIds, setPinnedGroupsData, showToast]);

  const renameGroup = useCallback(async (groupId, newName) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/whatsapp/groups', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, newName: newName.trim() })
      });
      if (res.ok) {
        setPinnedGroupsData(prev => prev.map(g => g.id === groupId ? { ...g, name: newName.trim() } : g));
        showToast('Nombre actualizado', 'success');
        fetchChats();
      }
    } catch { showToast('Error al renombrar', 'error'); }
    setRenamingGroupId(null);
    setRenameValue('');
  }, [fetchChats, setPinnedGroupsData, showToast]);

  const loadVisibleProfilePics = useCallback(({ startIndex, endIndex }) => {
    if (!queueProfilePic) return;
    filtered.slice(startIndex, endIndex + 1).forEach(chat => {
      if (profilePics[chat.phone] === undefined) queueProfilePic(chat.phone);
    });
  }, [filtered, profilePics, queueProfilePic]);

  return (
    <>
      <div className={`${styles.left} ${activeChat ? styles.leftHidden : ''}`}>

        {isOffline && <div className={styles.offlineBanner}>⚠️ Sin conexión — reintentando...</div>}

        <div className={styles.leftHeader}>
          <Avatar name="El Diablito" size={40} />
          <span className={styles.leftTitle}>
            Chats <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.55, marginLeft: 4 }}>({chats.length}{chatTotal > chats.length ? `/${chatTotal}` : ''})</span>
          </span>
          <div className={styles.headerIconsLeft}>
            <button
              className={`${styles.shopModeToggle} ${shopOffline ? styles.shopModeOffline : styles.shopModeOnline}`}
              onClick={toggleShopMode}
              title={shopOffline ? 'Sistema OFFLINE — clic para poner ONLINE' : 'Sistema ONLINE — clic para poner OFFLINE'}
            >
              <span className={styles.shopModeDot} />
              {shopOffline ? 'OFFLINE' : 'ONLINE'}
            </button>
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

        <div className={styles.storeFilterBar}>
          <select className={styles.storeSelect} value={storeFilter} onChange={e => setStoreFilter(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            className={`${styles.unreadFilterBtn} ${unreadFilter ? styles.unreadFilterActive : ''}`}
            onClick={() => setUnreadFilter(v => {
              const next = !v;
              localStorage.setItem('chat_unread_filter', next ? '1' : '0');
              return next;
            })}
            title={unreadFilter ? 'Mostrando no leídos y fijados' : 'Mostrar solo no leídos y fijados'}
          >
            {unreadFilter ? '🔴 No leídos' : '⚪ No leídos'}
          </button>
          <button className={styles.markAllUnreadBtn} onClick={markAllRead} title="Marcar todos como leídos">✓ Leer</button>
          <button
            className={`${styles.markAllUnreadBtn} ${hideGroups ? styles.unreadFilterActive : ''}`}
            onClick={() => setHideGroups(v => { const n = !v; localStorage.setItem('chat_hide_groups', n ? '1' : '0'); return n; })}
            title={hideGroups ? 'Mostrar grupos' : 'Ocultar grupos'}
          >{hideGroups ? '👥 Off' : '👥'}</button>
        </div>

        {/* Agregar chat */}
        <div className={styles.newChatSection}>
          <button
            className={`${styles.newChatToggle} ${showNewChat ? styles.newChatToggleActive : ''}`}
            onClick={() => {
              setShowNewChat(!showNewChat);
              setNewPhone(''); setNewName(''); setNewPhoneLoyverse(null);
            }}
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
                      } catch { setNewPhoneLoyverse({ found: false }); }
                      setNewPhoneSearching(false);
                    }
                  }}
                  maxLength={10}
                />
                {newPhoneSearching && <span style={{ fontSize: 11, color: '#8696a0', flexShrink: 0 }}>Buscando...</span>}
              </div>

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
                  let loyverseOk = newPhoneLoyverse?.found;
                  if (!newPhoneLoyverse?.found) {
                    try {
                      const loyRes = await fetch('/api/loyverse/client-card', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName.trim(), phone: newPhone.slice(-10) })
                      });
                      const loyData = await loyRes.json();
                      loyverseOk = loyRes.ok && loyData.success;
                      if (!loyverseOk) showToast(`Error Loyverse: ${loyData.error?.errors?.[0]?.message || 'Error desconocido'}`, 'error');
                    } catch { showToast('Error de conexión al crear cliente', 'error'); }
                  }
                  await fetch('/api/whatsapp/create-chat', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: cleanPhone, name: newName.trim() })
                  });
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

        {/* Lista de chats virtualizada — solo renderiza los visibles */}
        <div className={styles.chatList}>
          {loadingChats && <p className={styles.tip}>Cargando chats...</p>}
          {!loadingChats && filtered.length === 0 && (
            <p className={styles.tip}>{storeFilter ? `Sin chats en ${storeFilter}` : 'Sin chats aún'}</p>
          )}
          {filtered.length > 0 && (
            <Virtuoso
              style={{ height: '100%' }}
              data={filtered}
              overscan={5}
              computeItemKey={(_, chat) => chat.phone}
              rangeChanged={loadVisibleProfilePics}
              endReached={() => {
                if (hasMoreChats && !loadingMoreChats) loadMoreChats?.();
              }}
              components={{
                Footer: () => (
                  <div style={{ minHeight: 34, display: 'grid', placeItems: 'center' }}>
                    {loadingMoreChats && <span className={styles.tip}>Cargando más chats...</span>}
                    {!loadingMoreChats && !hasMoreChats && chats.length > 10 && <span className={styles.tip}>Fin de la lista</span>}
                  </div>
                )
              }}
              itemContent={(_, chat) => (
                <ChatRow
                  chat={chat}
                  isActive={activeChat?.phone === chat.phone}
                  picUrl={profilePics[chat.phone]}
                  onOpen={openChat}
                  onToggleRead={toggleHumanRead}
                  onDelete={setChatToDelete}
                />
              )}
            />
          )}
        </div>
      </div>

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
            <p className={styles.deleteNote}>Se borrará el historial completo de este chat.<br />Esta acción no se puede deshacer.</p>
            <div className={styles.deleteActions}>
              <button className={styles.deleteCancelBtn} onClick={() => setChatToDelete(null)} disabled={deletingChat}>Cancelar</button>
              <button className={styles.deleteConfirmBtn} onClick={confirmDeleteChat} disabled={deletingChat}>
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
              <h3 className={styles.groupsModalTitle}><Users size={20} /> Grupos de WhatsApp</h3>
              <button className={styles.groupsModalClose} onClick={() => { setShowGroupsModal(false); setRenamingGroupId(null); }}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.groupsModalSub}>Fija grupos y personaliza sus nombres para tu panel</p>
            <div className={styles.groupsList}>
              {loadingGroups && <p className={styles.groupsLoading}>Cargando grupos...</p>}

              {pinnedGroupsData.length > 0 && (
                <>
                  <div className={styles.groupSectionLabel}>📌 Fijados ({pinnedGroupsData.length})</div>
                  {pinnedGroupsData.map(pg => {
                    const gwGroup = gatewayGroups.find(g => g.id === pg.id);
                    const originalName = gwGroup?.name || pg.id;
                    return (
                      <div key={pg.id} className={`${styles.groupItem} ${styles.groupItemPinned}`}>
                        <div className={styles.groupInfo}>
                          <div className={styles.groupAvatar}><Avatar name={pg.name} size={40} /></div>
                          <div className={styles.groupText}>
                            {renamingGroupId === pg.id ? (
                              <div className={styles.renameRow}>
                                <input
                                  className={styles.renameInput}
                                  value={renameValue}
                                  onChange={e => setRenameValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') renameGroup(pg.id, renameValue);
                                    if (e.key === 'Escape') setRenamingGroupId(null);
                                  }}
                                  autoFocus
                                  placeholder="Nombre del grupo"
                                />
                                <button className={styles.renameSaveBtn} onClick={() => renameGroup(pg.id, renameValue)}><Check size={14} /></button>
                                <button className={styles.renameCancelBtn} onClick={() => setRenamingGroupId(null)}><X size={14} /></button>
                              </div>
                            ) : (
                              <div className={styles.nameWithEdit}>
                                <span className={styles.groupName}>{pg.name}</span>
                                <button className={styles.editNameBtn} onClick={() => { setRenamingGroupId(pg.id); setRenameValue(pg.name); }} title="Renombrar grupo">
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

              {!loadingGroups && gatewayGroups.length > 0 && (
                <>
                  <div className={styles.groupSectionLabel}>👥 Disponibles ({gatewayGroups.filter(g => !pinnedGroupIds.includes(g.id)).length})</div>
                  {gatewayGroups.filter(g => !pinnedGroupIds.includes(g.id)).map(g => (
                    <div key={g.id} className={styles.groupItem}>
                      <div className={styles.groupInfo}>
                        <div className={styles.groupAvatar}>
                          {g.picture
                            ? <img src={g.picture} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                            : <Avatar name={g.name} size={40} />}
                        </div>
                        <div className={styles.groupText}>
                          <span className={styles.groupName}>{g.name}</span>
                          <span className={styles.groupParticipants}>{g.participants ? `${g.participants} participantes` : g.id}</span>
                        </div>
                      </div>
                      <button className={styles.pinBtn} onClick={() => togglePinGroup(g)} disabled={pinningGroup === g.id}>
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
    </>
  );
}

export default React.memo(ChatListPanel);
