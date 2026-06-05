'use client';
import React, { useState, useCallback } from 'react';
import { Avatar } from '../_atoms';
import { titleCase } from '../_utils';
import styles from '../page.module.css';

export default function ClientCard({
  activeChat,
  setActiveChat,
  setChats,
  profilePics,
  clientCard,
  setClientCard,
  loadingCard,
  stores,
  showToast,
  clearClientCache,
}) {
  const [editingField, setEditingField] = useState(null);
  const [blocking, setBlocking] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [editName, setEditName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editStore, setEditStore] = useState('');
  const [savingField, setSavingField] = useState(false);

  const saveClientField = useCallback(async (field) => {
    setSavingField(true);
    try {
      if (!clientCard?.client?.customerId) {
        if (field !== 'name') { setSavingField(false); return; }
        const res = await fetch('/api/loyverse/client-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editName, phone: clientCard.client.phone })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setClientCard(prev => ({
            ...prev,
            client: { ...prev.client, name: editName, customerId: data.customer?.id || prev.client.customerId }
          }));
          setChats(prev => prev.map(c => c.phone === activeChat?.phone ? { ...c, name: editName } : c));
          showToast('Cliente registrado correctamente', 'success');
          setEditingField(null);
        } else {
          showToast('Error al registrar cliente', 'error');
        }
        setSavingField(false);
        return;
      }

      const body = { id: clientCard.client.customerId, _phone: clientCard.client.phone };
      if (field === 'name') body.name = editName;
      if (field === 'address') body.address = editAddress;
      if (field === 'store') {
        const currentNote = clientCard.client._note || '';
        body.note = currentNote.includes('Tienda:')
          ? currentNote.replace(/Tienda:\s*.+?(\n|$)/, `Tienda: ${editStore}$1`)
          : (currentNote ? `${currentNote}\nTienda: ${editStore}` : `Tienda: ${editStore}`);
        body._storeRedis = editStore;
      }
      const res = await fetch('/api/loyverse/client-card', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        clearClientCache?.(clientCard.client.phone);
        setClientCard(prev => {
          const updatedNote = field === 'store'
            ? (body.note || prev.client._note || '')
            : prev.client._note;
          return {
            ...prev,
            client: {
              ...prev.client,
              name: field === 'name' ? editName : prev.client.name,
              address: field === 'address' ? editAddress : prev.client.address,
              tienda: field === 'store' ? editStore : prev.client.tienda,
              _note: updatedNote,
            }
          };
        });
        if (field === 'name') setChats(prev => prev.map(c => c.phone === activeChat?.phone ? { ...c, name: editName } : c));
        showToast('Actualizado correctamente', 'success');
        setEditingField(null);
      } else {
        showToast('Error al guardar', 'error');
      }
    } catch { showToast('Error de conexión', 'error'); }
    setSavingField(false);
  }, [clientCard, editAddress, editStore, editName, activeChat, setClientCard, setChats, showToast, clearClientCache]);

  return (
    <div className={styles.infoPanel}>
      <div className={styles.infoPanelHeader}>
        <span>Perfil del cliente</span>
        {activeChat && (
          <div style={{ display: 'flex', gap: 6 }}>
            {/* Guardar como contacto en WhatsApp */}
            <button
              onClick={async () => {
                const name = clientCard?.client?.name || activeChat.name;
                if (!name || name === activeChat.phone.slice(-10)) {
                  showToast('El cliente no tiene nombre guardado', 'error');
                  return;
                }
                setSavingContact(true);
                try {
                  const firstName = name.trim().split(' ')[0];
                  const res = await fetch('/api/whatsapp/contact-save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: activeChat.phone, fullName: name, firstName })
                  });
                  const data = await res.json();
                  if (data.success) {
                    showToast('Guardado en contactos de WhatsApp ✅', 'success');
                  } else {
                    showToast(data.error || 'Error al guardar contacto', 'error');
                  }
                } catch { showToast('Error de conexión', 'error'); }
                setSavingContact(false);
              }}
              disabled={savingContact}
              title="Guardar como contacto en WhatsApp"
              style={{
                background: 'none',
                border: '1px solid rgba(52,199,89,0.5)',
                color: '#34c759', borderRadius: 6, padding: '3px 10px',
                cursor: savingContact ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
                opacity: savingContact ? 0.5 : 1
              }}
            >
              {savingContact ? '...' : '👤 Guardar'}
            </button>

            {/* Bloquear / Desbloquear */}
            <button
              onClick={async () => {
                const isCurrentlyBlocked = activeChat.isBlocked;
                setBlocking(true);
                try {
                  const res = await fetch('/api/whatsapp/block', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: activeChat.phone, blocked: !isCurrentlyBlocked })
                  });
                  const data = await res.json();
                  if (data.success) {
                    setChats(prev => prev.map(c =>
                      c.phone === activeChat.phone ? { ...c, isBlocked: !isCurrentlyBlocked } : c
                    ));
                    setActiveChat(prev => ({ ...prev, isBlocked: !isCurrentlyBlocked }));
                    showToast(isCurrentlyBlocked ? 'Desbloqueado en WhatsApp ✅' : 'Bloqueado en WhatsApp 🚫', 'success');
                  } else {
                    showToast(data.error || 'Error al bloquear', 'error');
                  }
                } catch { showToast('Error de conexión', 'error'); }
                setBlocking(false);
              }}
              disabled={blocking}
              style={{
                background: activeChat.isBlocked ? 'rgba(255,59,48,0.15)' : 'none',
                border: `1px solid ${activeChat.isBlocked ? '#ff3b30' : 'rgba(255,59,48,0.4)'}`,
                color: '#ff3b30', borderRadius: 6, padding: '3px 10px',
                cursor: blocking ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
                opacity: blocking ? 0.5 : 1
              }}
            >
              {blocking ? '...' : activeChat.isBlocked ? '🔓 Desbloquear' : '🚫 Bloquear'}
            </button>
          </div>
        )}
      </div>

      {!clientCard ? (
        <div className={styles.infoLoading}>Cargando...</div>
      ) : (
        <div className={styles.infoFixed} style={{ opacity: loadingCard ? 0.6 : 1, transition: 'opacity 0.2s' }}>

          {/* Avatar + nombre */}
          <div className={styles.infoAvatar}>
            <Avatar
              name={titleCase(clientCard?.client?.name || activeChat.name)}
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
                <div className={styles.infoName}>{titleCase(clientCard?.client?.name || activeChat.name)}</div>
                {clientCard?.client && (
                  <button className={styles.infoEditBtn} onClick={() => {
                    setEditName(clientCard?.client?.name || '');
                    setEditingField('name');
                  }}>{clientCard?.client?.customerId ? 'Editar' : 'Capturar'}</button>
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

          {/* Sucursal */}
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
                  {stores.map(s => <option key={s} value={s}>{s}</option>)}
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

          {/* Dirección */}
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
                {clientCard?.client?.address ? titleCase(clientCard.client.address) : <span className={styles.infoEmpty}>Sin dirección</span>}
              </div>
            )}
          </div>

          {/* Cupones */}
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

          {/* Compras recientes */}
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
  );
}
