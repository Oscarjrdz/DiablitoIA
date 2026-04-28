'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';

export default function GastosPage() {
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lightboxImg, setLightboxImg] = useState(null);

  // Form state
  const [proveedor, setProveedor] = useState('');
  const [monto, setMonto] = useState('');
  const [preview, setPreview] = useState(null);     // base64 for preview
  const [imageData, setImageData] = useState(null);  // base64 to store

  const fileInputRef = useRef(null);

  // ── Fetch all gastos ──
  const fetchGastos = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/gastos');
      const data = await res.json();
      if (data.success) {
        setGastos(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching gastos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGastos();
  }, []);

  // ── Calculate total ──
  const totalGasto = gastos.reduce((sum, g) => sum + (g.monto || 0), 0);

  // ── Image processing ──
  const processImage = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) return;

    setProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      setPreview(base64);
      setImageData(base64);

      // Try to auto-detect proveedor from filename
      const name = file.name.toLowerCase().replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
      if (!proveedor) {
        // Common store detection patterns
        const stores = [
          { pattern: /oxxo/i, name: 'OXXO' },
          { pattern: /walmart/i, name: 'Walmart' },
          { pattern: /soriana/i, name: 'Soriana' },
          { pattern: /heb|h[- ]?e[- ]?b/i, name: 'HEB' },
          { pattern: /costco/i, name: 'Costco' },
          { pattern: /sams|sam'?s/i, name: "Sam's Club" },
          { pattern: /seven|7[- ]?eleven/i, name: '7-Eleven' },
          { pattern: /chedraui/i, name: 'Chedraui' },
          { pattern: /bodega/i, name: 'Bodega Aurrera' },
          { pattern: /office|depot/i, name: 'Office Depot' },
          { pattern: /home ?depot/i, name: 'Home Depot' },
          { pattern: /liverpool/i, name: 'Liverpool' },
          { pattern: /elektra/i, name: 'Elektra' },
          { pattern: /farma/i, name: 'Farmacia' },
          { pattern: /gas/i, name: 'Gasolinera' },
          { pattern: /uber/i, name: 'Uber' },
          { pattern: /didi/i, name: 'DiDi' },
          { pattern: /rappi/i, name: 'Rappi' },
          { pattern: /mercado/i, name: 'Mercado Libre' },
          { pattern: /amazon/i, name: 'Amazon' },
        ];
        for (const s of stores) {
          if (s.pattern.test(name)) {
            setProveedor(s.name);
            break;
          }
        }
      }

      setProcessing(false);
    };
    reader.readAsDataURL(file);
  }, [proveedor]);

  // ── Drag & Drop ──
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    processImage(file);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    processImage(file);
  };

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!proveedor.trim() || !monto) {
      alert('Ingresa proveedor y monto');
      return;
    }

    try {
      const res = await fetch('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor: proveedor.trim(),
          monto: parseFloat(monto),
          imagen: imageData,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        resetForm();
        fetchGastos();
      } else {
        alert('Error: ' + (data.error || 'No se pudo guardar'));
      }
    } catch (error) {
      alert('Error de conexión');
    }
  };

  // ── Delete ──
  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este gasto?')) return;

    try {
      const res = await fetch(`/api/gastos?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchGastos();
      }
    } catch (error) {
      alert('Error al eliminar');
    }
  };

  // ── Reset form ──
  const resetForm = () => {
    setProveedor('');
    setMonto('');
    setPreview(null);
    setImageData(null);
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
  };

  // ── Format currency ──
  const formatMXN = (n) => `$${Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Format date ──
  const formatFecha = (iso) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <h1>🧾 Gastos</h1>
        <div className={styles.headerActions}>
          <button className={styles.addBtn} onClick={openModal}>
            <span style={{ fontSize: '1.1rem' }}>+</span> Agregar Gasto
          </button>
        </div>
      </header>

      {/* Total Card */}
      <div className={styles.totalCard}>
        <div>
          <div className={styles.totalLabel}>Total Acumulado</div>
          <div className={styles.totalAmount}>{formatMXN(totalGasto)}</div>
        </div>
        <div className={styles.totalCount}>
          <span className={styles.totalCountNum}>{gastos.length}</span>
          ticket{gastos.length !== 1 ? 's' : ''} registrado{gastos.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className={styles.emptyState}>
          <div className={styles.spinner} />
          <p style={{ marginTop: '12px', color: 'var(--text-secondary)' }}>Cargando gastos...</p>
        </div>
      ) : gastos.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>📋</div>
          <p className={styles.emptyText}>No hay gastos registrados</p>
          <p className={styles.emptySub}>Toca &quot;Agregar Gasto&quot; para empezar a registrar tus tickets</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Proveedor</th>
                <th>Monto</th>
                <th>Ticket</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {gastos.map((gasto, idx) => (
                <tr key={gasto.id}>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{idx + 1}</td>
                  <td>
                    <span className={styles.proveedorBadge}>
                      🏪 {gasto.proveedor}
                    </span>
                  </td>
                  <td>
                    <span className={styles.monto}>{formatMXN(gasto.monto)}</span>
                  </td>
                  <td>
                    {gasto.imagen ? (
                      <div
                        className={styles.thumbnailWrapper}
                        onClick={() => setLightboxImg(gasto.imagen)}
                      >
                        <img src={gasto.imagen} alt={`Ticket ${gasto.proveedor}`} />
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Sin imagen</span>
                    )}
                  </td>
                  <td>
                    <span className={styles.fecha}>{formatFecha(gasto.fecha || gasto.createdAt)}</span>
                  </td>
                  <td>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(gasto.id)}>
                      🗑️ Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className={styles.modal}>
            <h2>📸 Nuevo Gasto</h2>

            {/* Upload Zone or Preview */}
            {processing ? (
              <div className={styles.processingOverlay}>
                <div className={styles.spinner} />
                <span className={styles.processingText}>Procesando imagen...</span>
              </div>
            ) : preview ? (
              <div className={styles.previewContainer}>
                <img src={preview} alt="Preview del ticket" />
                <button
                  className={styles.removePreview}
                  onClick={() => { setPreview(null); setImageData(null); }}
                  type="button"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div
                className={`${styles.uploadZone} ${dragging ? styles.dragging : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className={styles.uploadIcon}>📷</div>
                <p className={styles.uploadText}>
                  <span className={styles.uploadTextBold}>Toca para subir</span> o arrastra tu ticket
                </p>
                <p className={styles.uploadText} style={{ marginTop: '4px', fontSize: '0.8rem' }}>
                  JPG, PNG, HEIC
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label>Proveedor / Tienda</label>
                <input
                  type="text"
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  placeholder="Ej: OXXO, Walmart, HEB..."
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Monto Total ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={styles.saveBtn}
                  disabled={!proveedor.trim() || !monto}
                >
                  💾 Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImg && (
        <div className={styles.lightbox} onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="Ticket completo" />
        </div>
      )}
    </div>
  );
}
