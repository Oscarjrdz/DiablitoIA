'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './page.module.css';

const fmtMXN = (cents) => {
  const n = Number(cents || 0) / 100;
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function CatalogoPage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null); // null = create, object = edit
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSku, setFormSku] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Lightbox
  const [lightboxImg, setLightboxImg] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch catalog ──
  const fetchCatalog = useCallback(async (cursor = null) => {
    try {
      if (!cursor) setLoading(true);
      else setLoadingMore(true);

      let url = '/api/catalog?limit=100';
      if (cursor) url += `&cursor=${cursor}`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        const items = data.products || [];
        if (cursor) setProducts(prev => [...prev, ...items]);
        else setProducts(items);
        setNextCursor(data.nextPageCursor || null);
      } else {
        showToast(data.error || 'Error al cargar catálogo', 'error');
      }
    } catch {
      showToast('Error de conexión', 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { fetchCatalog(); }, [fetchCatalog]);

  // ── Open modal ──
  const openCreate = () => {
    setEditing(null);
    setFormName(''); setFormPrice(''); setFormDesc(''); setFormSku(''); setFormImageUrl('');
    setShowModal(true);
  };

  const openEdit = (product) => {
    setEditing(product);
    setFormName(product.name || '');
    setFormPrice(product.price ? (product.price / 100).toFixed(2) : '');
    setFormDesc(product.description || '');
    setFormSku(product.retailerId || '');
    const img = product.images?.[0]?.url || product.images?.[0] || '';
    setFormImageUrl(img);
    setShowModal(true);
  };

  // ── Create / Update ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setSubmitting(true);

    try {
      const priceCents = Math.round(parseFloat(formPrice || '0') * 100);

      if (editing) {
        // PATCH
        const body = { productId: editing.id };
        if (formName.trim() !== editing.name) body.name = formName.trim();
        if (formDesc.trim() !== (editing.description || '')) body.description = formDesc.trim();
        if (priceCents !== (editing.price || 0)) body.price = priceCents;
        if (formImageUrl.trim()) body.images = [formImageUrl.trim()];
        if (formSku.trim() !== (editing.retailerId || '')) body.retailerId = formSku.trim();

        // Only send if there are changes
        const hasChanges = Object.keys(body).length > 1;
        if (!hasChanges) {
          showToast('Sin cambios que guardar');
          setShowModal(false);
          setSubmitting(false);
          return;
        }

        const res = await fetch('/api/catalog', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          showToast('Producto actualizado');
          setShowModal(false);
          fetchCatalog();
        } else {
          showToast(data.error || 'Error al actualizar', 'error');
        }
      } else {
        // POST
        const body = {
          name: formName.trim(),
          description: formDesc.trim(),
          price: priceCents,
          currency: 'MXN',
        };
        if (formImageUrl.trim()) body.images = [formImageUrl.trim()];
        if (formSku.trim()) body.retailerId = formSku.trim();

        const res = await fetch('/api/catalog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          showToast('Producto creado exitosamente');
          setShowModal(false);
          fetchCatalog();
        } else {
          showToast(data.error || 'Error al crear', 'error');
        }
      }
    } catch {
      showToast('Error de conexión', 'error');
    }
    setSubmitting(false);
  };

  // ── Delete ──
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/catalog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [deleteTarget.id] })
      });
      const data = await res.json();
      if (data.success) {
        setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
        showToast('Producto eliminado');
      } else {
        showToast(data.error || 'Error al eliminar', 'error');
      }
    } catch {
      showToast('Error de conexión', 'error');
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  // ── Filter ──
  const filtered = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s)
      || (p.description || '').toLowerCase().includes(s)
      || (p.retailerId || '').toLowerCase().includes(s);
  });

  const withPrice = products.filter(p => p.price > 0).length;
  const withImage = products.filter(p => p.images?.length > 0).length;

  return (
    <div className={styles.container}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <h1>📦 Catálogo</h1>
        <div className={styles.headerActions}>
          <button className={styles.refreshBtn} onClick={() => fetchCatalog()} title="Recargar">
            🔄
          </button>
          <button className={styles.addBtn} onClick={openCreate}>
            <span style={{ fontSize: '1.1rem' }}>+</span> Nuevo Producto
          </button>
        </div>
      </header>

      {/* ── Stats ── */}
      <div className={styles.statsCard}>
        <div className={styles.statItem}>
          <div className={styles.statValue}>{products.length}</div>
          <div className={styles.statLabel}>Productos</div>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <div className={styles.statValue}>{withPrice}</div>
          <div className={styles.statLabel}>Con precio</div>
        </div>
        <div className={styles.statDivider} />
        <div className={styles.statItem}>
          <div className={styles.statValue}>{withImage}</div>
          <div className={styles.statLabel}>Con imagen</div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className={styles.searchBar}>
        <span className={styles.searchIcon}>🔍</span>
        <input
          className={styles.searchInput}
          placeholder="Buscar producto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className={styles.clearSearch} onClick={() => setSearch('')}>✕</button>
        )}
      </div>

      {/* ── Product Grid ── */}
      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.spinner} />
          <p style={{ marginTop: 12, color: 'var(--text-secondary)' }}>Cargando catálogo...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📦</div>
          <p className={styles.emptyText}>
            {search ? 'Sin resultados' : 'El catálogo está vacío'}
          </p>
          <p className={styles.emptySub}>
            {search ? 'Intenta con otros términos' : 'Agrega tu primer producto con el botón "Nuevo Producto"'}
          </p>
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            {filtered.map(product => {
              const imgUrl = product.images?.[0]?.url || product.images?.[0] || null;
              return (
                <div key={product.id} className={styles.card}>
                  {/* Image */}
                  <div
                    className={styles.cardImage}
                    onClick={() => imgUrl && setLightboxImg(imgUrl)}
                    style={{ cursor: imgUrl ? 'pointer' : 'default' }}
                  >
                    {imgUrl ? (
                      <img src={imgUrl} alt={product.name} loading="lazy" />
                    ) : (
                      <div className={styles.noImage}>
                        <span>📷</span>
                        <small>Sin imagen</small>
                      </div>
                    )}
                    {product.isHidden && (
                      <span className={styles.hiddenBadge}>Oculto</span>
                    )}
                  </div>

                  {/* Body */}
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>{product.name || 'Sin nombre'}</h3>
                    {product.description && (
                      <p className={styles.cardDesc}>{product.description}</p>
                    )}
                    {product.retailerId && (
                      <span className={styles.skuBadge}>SKU: {product.retailerId}</span>
                    )}
                    <div className={styles.cardFooter}>
                      <span className={styles.cardPrice}>
                        {product.price > 0 ? fmtMXN(product.price) : 'Sin precio'}
                      </span>
                      <div className={styles.cardActions}>
                        <button className={styles.editBtn} onClick={() => openEdit(product)} title="Editar">
                          ✏️
                        </button>
                        <button className={styles.deleteBtn} onClick={() => setDeleteTarget(product)} title="Eliminar">
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {nextCursor && (
            <div className={styles.loadMoreWrap}>
              <button className={styles.loadMoreBtn} onClick={() => fetchCatalog(nextCursor)} disabled={loadingMore}>
                {loadingMore ? 'Cargando...' : 'Cargar más productos'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className={styles.modal}>
            <h2>{editing ? '✏️ Editar Producto' : '🆕 Nuevo Producto'}</h2>

            {/* Image URL preview */}
            {formImageUrl && (
              <div className={styles.previewContainer}>
                <img
                  src={formImageUrl}
                  alt="Preview"
                  onError={e => { e.target.style.display = 'none'; }}
                />
                <button className={styles.removePreview} onClick={() => setFormImageUrl('')} type="button">✕</button>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label>Nombre del producto *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Ej: Hamburguesa Doble"
                  required
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Precio (MXN)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formPrice}
                    onChange={e => setFormPrice(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label>SKU / Código</label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={e => setFormSku(e.target.value)}
                    placeholder="HAM-001"
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Descripción</label>
                <textarea
                  className={styles.textarea}
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  placeholder="Descripción corta del producto..."
                  rows={3}
                />
              </div>

              <div className={styles.formGroup}>
                <label>URL de imagen</label>
                <input
                  type="url"
                  value={formImageUrl}
                  onChange={e => setFormImageUrl(e.target.value)}
                  placeholder="https://ejemplo.com/foto.jpg"
                />
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className={styles.saveBtn} disabled={submitting || !formName.trim()}>
                  {submitting ? 'Guardando...' : editing ? '💾 Actualizar' : '💾 Crear Producto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={e => e.target === e.currentTarget && !deleting && setDeleteTarget(null)}>
          <div className={styles.deleteModal}>
            <div className={styles.deleteIcon}>🗑️</div>
            <h3>¿Eliminar producto?</h3>
            <p className={styles.deleteProductName}>{deleteTarget.name}</p>
            <p className={styles.deleteWarning}>Esta acción no se puede deshacer</p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)} disabled={deleting}>
                Cancelar
              </button>
              <button className={styles.deleteBtnConfirm} onClick={confirmDelete} disabled={deleting}>
                {deleting ? 'Eliminando...' : '🗑️ Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxImg && (
        <div className={styles.lightbox} onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="Producto" />
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : ''}`}>
          {toast.type === 'error' ? '❌' : '✅'} {toast.msg}
        </div>
      )}
    </div>
  );
}
