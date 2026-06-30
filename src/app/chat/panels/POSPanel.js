'use client';
import React, { useState, useRef, useCallback, useMemo, useTransition, useDeferredValue, useEffect } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { X } from 'lucide-react';
import { PosProductCard } from '../_atoms';
import { variantName, ORDER_TYPE_LABELS } from '../_utils';
import styles from '../page.module.css';

export default function POSPanel({ activeChat, clientCard, pinnedGroupsData, showToast, addOptimisticMsg }) {
  const posDataLoadedRef = useRef(false);
  const [posItems, setPosItems] = useState([]);
  const [posStores, setPosStores] = useState([]);
  const [posPayTypes, setPosPayTypes] = useState([]);
  const [posPayTypeId, setPosPayTypeId] = useState('');
  const [posLoading, setPosLoading] = useState(false);
  const [posCart, setPosCart] = useState([]);
  const [posStoreId, setPosStoreId] = useState('');
  const [posSearch, setPosSearch] = useState('');
  const [posSending, setPosSending] = useState(false);
  const [posVariantPicker, setPosVariantPicker] = useState(null);
  const [posGroupPickerOpen, setPosGroupPickerOpen] = useState(false);
  const [posSelectedGroups, setPosSelectedGroups] = useState([]);
  const [posSendingToGroups, setPosSendingToGroups] = useState(false);
  const [posComment, setPosComment] = useState('');
  const [posModifiers, setPosModifiers] = useState([]);
  const [posModifierPicker, setPosModifierPicker] = useState(null);
  const [posSelectedModifiers, setPosSelectedModifiers] = useState([]);
  const [posOrderType, setPosOrderType] = useState('domicilio');

  const [, startCartTransition] = useTransition();
  const deferredPosSearch = useDeferredValue(posSearch);

  const fetchPOSData = useCallback(async (bust = false) => {
    if (!bust && posDataLoadedRef.current) return;
    posDataLoadedRef.current = true;
    setPosLoading(true);
    try {
      const res = await fetch(bust ? '/api/loyverse/pos?bust=1' : '/api/loyverse/pos');
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPOSData();
  }, [fetchPOSData]);

  const posFiltered = useMemo(
    () => !deferredPosSearch
      ? posItems
      : posItems.filter(item => item.item_name.toLowerCase().includes(deferredPosSearch.toLowerCase())),
    [posItems, deferredPosSearch]
  );

  const cartTotals = useMemo(() => {
    const map = {};
    for (const c of posCart) map[c.itemId] = (map[c.itemId] || 0) + c.qty;
    return map;
  }, [posCart]);

  const posTotal = useMemo(() => posCart.reduce((sum, c) => sum + c.price * c.qty, 0), [posCart]);

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

  const posUpdateQty = useCallback((cartKey, delta) => {
    startCartTransition(() => {
      setPosCart(prev => prev.map(c => c.cartKey === cartKey ? { ...c, qty: c.qty + delta } : c).filter(c => c.qty > 0));
    });
  }, [startCartTransition]);

  const posRemoveItem = useCallback((cartKey) => {
    startCartTransition(() => {
      setPosCart(prev => prev.filter(c => c.cartKey !== cartKey));
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

  const posHandleCardOpen = useCallback((item, firstVariant, hasMulti) => {
    if (hasMulti) setPosVariantPicker({ item });
    else posHandleVariantSelect(item, firstVariant);
  }, [posHandleVariantSelect]);

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
        if (posSelectedModifiers.includes(opt.id)) selectedOptions.push({ name: opt.name, price: opt.price || 0 });
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

  const posSendSummary = useCallback(async () => {
    if (!posCart.length || !activeChat || posSending) return;
    setPosSending(true);
    const storeName = posStores.find(s => s.id === posStoreId)?.name || '';
    const orderLabel = ORDER_TYPE_LABELS[posOrderType] || posOrderType;
    const lines = posCart.map(c =>
      `• ${c.name} x${c.qty} — $${(c.price * c.qty).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`
    ).join('\n');
    const text = `🛒 *Resumen de tu pedido:*\n\n*Tipo:* ${orderLabel}\n\n${lines}\n\n*Total: $${posTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*${storeName ? `\n\nSucursal: ${storeName}` : ''}`;
    const _localId = `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const now = Date.now();
    const timeStr = new Date(now).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' });
    const optimistic = { _localId, text, fromMe: true, ts: now, time: timeStr, status: 'sent' };
    addOptimisticMsg?.(optimistic);
    try {
      const res = await fetch('/api/whatsapp/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeChat.phone, text })
      });
      const data = await res.json().catch(() => ({}));
      if (!data.success) showToast('Error al enviar resumen', 'error');
      else showToast('Resumen enviado al cliente ✅', 'success');
    } catch { showToast('Error al enviar resumen', 'error'); }
    setPosSending(false);
  }, [posCart, posStoreId, posStores, posTotal, activeChat, posSending, posOrderType, showToast, addOptimisticMsg]);

  const posSendToGroups = useCallback(async () => {
    if (!posSelectedGroups.length || posSendingToGroups) return;
    setPosSendingToGroups(true);
    const clientName = clientCard?.client?.name || activeChat?.name || 'Cliente';
    const clientPhone = (activeChat?.phone || '').replace(/^52/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    const clientAddress = clientCard?.client?.address || '';
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
      (clientAddress ? `🏠 *Domicilio:* ${clientAddress}\n` : '') +
      (storeName ? `🏪 *Sucursal:* ${storeName}\n` : '') +
      `\n📋 *Pedido:*\n${lines}\n\n` +
      (paymentName ? `💳 *Pago:* ${paymentName}\n` : '') +
      `💰 *Total: $${posTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}*\n` +
      (posComment.trim() ? `\n💬 *Comentarios:*\n${posComment.trim()}\n` : '') +
      `━━━━━━━━━━━━━━`;
    try {
      await Promise.all(posSelectedGroups.map(groupId =>
        fetch('/api/whatsapp/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: groupId, text })
        })
      ));
      showToast(`Pedido enviado a ${posSelectedGroups.length} sucursal(es) ✅`, 'success');
      setPosGroupPickerOpen(false);
      setPosSelectedGroups([]);
      setPosComment('');
    } catch { showToast('Error al enviar a sucursales', 'error'); }
    setPosSendingToGroups(false);
  }, [posSelectedGroups, posCart, posStoreId, posStores, posPayTypeId, posPayTypes, posTotal, clientCard, activeChat, posSendingToGroups, posOrderType, posComment, showToast]);

  return (
    <div className={styles.posPanel}>
      <div className={styles.posPanelHeader}>
        <span>🛒 Punto de Venta</span>
        <button
          onClick={() => fetchPOSData(true)}
          disabled={posLoading}
          title="Actualizar catálogo desde Loyverse"
          style={{ background: 'none', border: 'none', cursor: posLoading ? 'default' : 'pointer', fontSize: 14, opacity: posLoading ? 0.4 : 0.7, padding: '0 4px', lineHeight: 1 }}
        >
          {posLoading ? '⏳' : '🔄'}
        </button>
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
          <VirtuosoGrid
            style={{ flex: 1, minHeight: 0, overflowX: 'hidden' }}
            data={posFiltered}
            overscan={5}
            listClassName={styles.posGrid}
            itemContent={(index, item) => (
              <PosProductCard
                item={item}
                totalInCart={cartTotals[item.id] || 0}
                posStoreId={posStoreId}
                onOpen={posHandleCardOpen}
              />
            )}
          />
        )}
      </div>

      {/* Carrito */}
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
            {posCart.map(item => (
              <div key={item.cartKey} className={styles.posCartRow}>
                <div className={styles.posCartInfo}>
                  <span className={styles.posCartName}>{item.name}</span>
                  <span className={styles.posCartSubprice}>${item.price.toLocaleString('es-MX', { minimumFractionDigits: 0 })} c/u</span>
                </div>
                <div className={styles.posCartControls}>
                  <button className={styles.posQtyBtn} onClick={() => posUpdateQty(item.cartKey, -1)}>−</button>
                  <span className={styles.posQtyNum}>{item.qty}</span>
                  <button className={styles.posQtyBtn} onClick={() => posUpdateQty(item.cartKey, 1)}>+</button>
                  <span className={styles.posCartTotal}>${(item.price * item.qty).toLocaleString('es-MX', { minimumFractionDigits: 0 })}</span>
                  <button className={styles.posCartRemove} onClick={() => posRemoveItem(item.cartKey)}><X size={11} /></button>
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
              👤 {clientCard.client.name || activeChat?.name}
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
  );
}
