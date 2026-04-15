'use client';

import React, { useState, useEffect } from 'react';
import styles from '../clients/page.module.css';
import Link from 'next/link';

export default function PromocionesPage() {
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [saving, setSaving] = useState(false);
  // Estado para envío rápido de cupón por promo
  const [sendPhone, setSendPhone] = useState({});
  const [sendStatus, setSendStatus] = useState({});
  const [formData, setFormData] = useState({
    text: '',
    image: '',
    visitTriggers: '',
    spendTriggers: '',
    itemName: 'Burger Gratis',
    isWelcomePromo: false,
    validFrom: 'hoy',
    validityDuration: '1'
  });

  const commonEmojis = ['👋', '🔥', '🎁', '🍔', '🌮', '🍻', '🎉', '👇', '👉', '✨', '🚨', '🤩'];
  const insertEmoji = (emoji) => setFormData(prev => ({ ...prev, text: prev.text + emoji }));


  const fetchPromos = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/promotions');
      const data = await res.json();
      if (data.success) {
        setPromos(data.data);
      }
    } catch (error) {
      console.error('Error fetching promos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromos();
    
    const handleEsc = (e) => {
      if (e.key === 'Escape') setShowModal(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === 'checkbox' ? checked : value });
  };

  // Image Upload with Canvas Compression
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Cap to 800px to save Redis space and bandwidth
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with 0.7 quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setFormData({ ...formData, image: dataUrl });
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const openCreateModal = () => {
    setEditingPromo(null);
    setFormData({ text: '', image: '', visitTriggers: '', spendTriggers: '', itemName: 'Burger Gratis', isWelcomePromo: false });
    setShowModal(true);
  };

  const openEditModal = (promo) => {
    setEditingPromo(promo);
    setFormData({
      text: promo.text || '',
      image: promo.image || '',
      visitTriggers: promo.visitTriggers || '',
      spendTriggers: promo.spendTriggers || '',
      itemName: promo.itemName || 'Burger Gratis',
      isWelcomePromo: promo.isWelcomePromo || false,
      validFrom: promo.validFrom || 'hoy',
      validityDuration: promo.validityDuration || '1'
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      let res;
      if (editingPromo) {
        res = await fetch('/api/promotions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingPromo.id, ...formData })
        });
      } else {
        res = await fetch('/api/promotions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Error saving');
      setShowModal(false);
      fetchPromos();
    } catch (error) {
      alert('Error guardando promoción: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Seguro que deseas borrar esta promoción?')) return;
    try {
      await fetch(`/api/promotions?id=${id}`, { method: 'DELETE' });
      fetchPromos();
    } catch (error) {
      console.error('Error deleting:', error);
    }
  };

  // ── Envío rápido de cupón desde la card ──
  const handleQuickSend = async (promoId) => {
    const phone = (sendPhone[promoId] || '').replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      setSendStatus(prev => ({ ...prev, [promoId]: { type: 'error', msg: 'Ingresa un número de 10 dígitos' } }));
      return;
    }

    setSendStatus(prev => ({ ...prev, [promoId]: { type: 'sending', msg: 'Enviando...' } }));

    try {
      const res = await fetch('/api/loyverse/clients/resend-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, promoId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSendStatus(prev => ({ ...prev, [promoId]: { type: 'success', msg: `✅ Enviado • Folio: ${data.folio}` } }));
        setSendPhone(prev => ({ ...prev, [promoId]: '' }));
        // Limpiar status después de 5 segundos
        setTimeout(() => setSendStatus(prev => ({ ...prev, [promoId]: null })), 5000);
      } else {
        setSendStatus(prev => ({ ...prev, [promoId]: { type: 'error', msg: data.error || 'Error al enviar' } }));
      }
    } catch (e) {
      setSendStatus(prev => ({ ...prev, [promoId]: { type: 'error', msg: 'Error de conexión' } }));
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Promociones Automáticas</h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Administra los mensajes de WhatsApp automáticos</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
            <Link href="/redimidos">
                <button className={styles.createBtn} style={{ background: '#f97316' }}>Historial Redimidos</button>
            </Link>
            <button className={styles.createBtn} onClick={openCreateModal}>
              Crear Promoción
            </button>
        </div>
      </header>

      {loading ? (
        <p>Cargando promociones...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {promos.map(promo => (
            <div key={promo.id} style={{ 
              background: '#fff', 
              borderRadius: '16px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)', 
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              border: promo.isWelcomePromo ? '2px solid #0ea5e9' : '1px solid #eaeaea'
            }}>
              {promo.image ? (
                <div style={{ width: '100%', height: '180px', backgroundImage: `url(${promo.image})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: '#f5f5f5' }} />
              ) : (
                <div style={{ width: '100%', height: '180px', background: 'linear-gradient(135deg, #f0fdfa, #ccfbf1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f766e', fontWeight: 600 }}>Solo Texto</div>
              )}
              
              <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  {promo.isWelcomePromo && (
                    <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Bienvenida (Auto)</span>
                  )}
                </div>
                
                <p style={{ whiteSpace: 'pre-wrap', color: '#333', fontSize: '0.95rem', lineHeight: '1.5', flex: 1, margin: 0 }}>{promo.text}</p>
                
                <div style={{ marginTop: '12px', padding: '10px', background: '#eef2ff', borderRadius: '8px', fontSize: '0.8rem', color: '#4338ca' }}>
                    <strong>Vigencia:</strong> a partir de <strong>{promo.validFrom || 'hoy'}</strong> por <strong>{promo.validityDuration || 1}</strong> día(s)
                  </div>
                {(promo.visitTriggers || promo.spendTriggers) && (
                  <div style={{ marginTop: '12px', padding: '10px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', color: '#475569' }}>
                    {promo.visitTriggers && <div><strong>Disparo en Visitas:</strong> {promo.visitTriggers}</div>}
                    {promo.spendTriggers && <div><strong>Disparo en Gastos acumulados:</strong> ${promo.spendTriggers}</div>}
                  </div>
                )}
                
                <div style={{ marginTop: '12px', padding: '10px', background: '#fffbeb', borderRadius: '8px', fontSize: '0.8rem', color: '#b45309', border: '1px solid #fef3c7' }}>
                  <strong>🏆 Loyverse Item:</strong> {promo.itemName || 'Burger Gratis'}
                </div>

                {/* ── ENVÍO RÁPIDO DE CUPÓN ── */}
                <div style={{ 
                  marginTop: '16px', 
                  padding: '14px', 
                  background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', 
                  borderRadius: '10px', 
                  border: '1px solid #bbf7d0'
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#166534', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    📲 Enviar cupón directo
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input 
                      type="text"
                      placeholder="WhatsApp (10 dígitos)"
                      value={sendPhone[promo.id] || ''}
                      onChange={(e) => setSendPhone(prev => ({ ...prev, [promo.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleQuickSend(promo.id); }}}
                      style={{ 
                        flex: 1, 
                        padding: '8px 12px', 
                        borderRadius: '8px', 
                        border: '1px solid #d1d5db', 
                        fontSize: '0.85rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button 
                      onClick={() => handleQuickSend(promo.id)}
                      disabled={sendStatus[promo.id]?.type === 'sending'}
                      style={{ 
                        padding: '8px 16px', 
                        background: sendStatus[promo.id]?.type === 'sending' ? '#9ca3af' : '#16a34a', 
                        color: '#fff', 
                        border: 'none', 
                        borderRadius: '8px', 
                        fontWeight: 700, 
                        cursor: sendStatus[promo.id]?.type === 'sending' ? 'wait' : 'pointer',
                        fontSize: '0.85rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {sendStatus[promo.id]?.type === 'sending' ? '⏳' : '📤 Enviar'}
                    </button>
                  </div>
                  {sendStatus[promo.id] && (
                    <div style={{ 
                      marginTop: '6px', 
                      fontSize: '0.78rem', 
                      fontWeight: 600,
                      color: sendStatus[promo.id].type === 'success' ? '#15803d' : sendStatus[promo.id].type === 'error' ? '#dc2626' : '#6b7280'
                    }}>
                      {sendStatus[promo.id].msg}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #eaeaea' }}>
                  <div style={{ display: 'flex', gap: '15px' }}>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Enviados</span>
                         <span style={{ fontSize: '1.2rem', color: '#0f172a', fontWeight: 800 }}>{promo.sentCount || 0}</span>
                     </div>
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                         <span style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Redimidos</span>
                         <span style={{ fontSize: '1.2rem', color: '#10b981', fontWeight: 800 }}>{promo.redeemCount || 0}</span>
                     </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={styles.editBtn} onClick={() => openEditModal(promo)}>Editar</button>
                    <button className={styles.deleteBtn} onClick={() => handleDelete(promo.id)}>Borrar</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {promos.length === 0 && (
            <p style={{ color: '#666' }}>No hay promociones activas.</p>
          )}
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={(e) => { if(e.target === e.currentTarget) setShowModal(false); }}>
          <div className={styles.modal} style={{ maxWidth: '700px', width: '95%' }}>
            <h2>{editingPromo ? 'Editar Promoción' : 'Nueva Promoción'}</h2>
            <form onSubmit={handleSubmit}>
              <div className={styles.formGroup}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '8px' }}>
                  <span>Texto del Mensaje * (Etiqueta: {'{'}nombre_de_cliente{'}'})</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', width: 'fit-content' }}>
                    {commonEmojis.map(e => <button key={e} type="button" onClick={() => insertEmoji(e)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem' }}>{e}</button>)}
                  </div>
                </label>
                <textarea 
                  required 
                  name="text" 
                  value={formData.text} 
                  onChange={handleInputChange} 
                  style={{ width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="¡Hola! Te damos la bienvenida..."
                />
              </div>

              <div className={styles.formGroup}>
                <label>Subir Imagen (Opcional)</label>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/webp" 
                  onChange={handleImageUpload} 
                  style={{ width: '100%', padding: '12px', border: '1px dashed #ddd', borderRadius: '8px', cursor: 'pointer', boxSizing: 'border-box' }}
                />
                {formData.image && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Vista previa (comprimida):</p>
                    <img src={formData.image} alt="Preview" style={{ maxHeight: '120px', borderRadius: '8px', border: '1px solid #eee' }} />
                  </div>
                )}
              </div>
              
              <div className={styles.formGroup} style={{ marginTop: '15px' }}>
                <label>Nombre del Premio Físico en Loyverse (ej. "Papa Asada Gratis")</label>
                <input 
                  type="text" 
                  name="itemName" 
                  value={formData.itemName} 
                  onChange={handleInputChange} 
                  placeholder="Burger Gratis"
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                />
              </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px' }}>
                <div className={styles.formGroup} style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <label>Válido a partir de</label>
                  <select
                    name="validFrom"
                    value={formData.validFrom}
                    onChange={handleInputChange}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box', backgroundColor: 'white' }}
                  >
                    <option value="hoy">Hoy</option>
                    <option value="mañana">Mañana</option>
                  </select>
                </div>
                <div className={styles.formGroup} style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <label>Vigencia (Días libres) - ej: 1 es un sólo día</label>
                  <input
                    type="number"
                    name="validityDuration"
                    value={formData.validityDuration}
                    onChange={handleInputChange}
                    min="1"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '15px', alignItems: 'end' }}>
                <div className={styles.formGroup} style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <label>Número de Visita (ej. 2,5,7)</label>
                  <input 
                    type="text" 
                    name="visitTriggers" 
                    value={formData.visitTriggers} 
                    onChange={handleInputChange} 
                    placeholder="2, 5, 7"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                  />
                </div>
                <div className={styles.formGroup} style={{ margin: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                  <label>Monto de Compra Acumulado (ej. 300,1000)</label>
                  <input 
                    type="text" 
                    name="spendTriggers" 
                    value={formData.spendTriggers} 
                    onChange={handleInputChange} 
                    placeholder="500, 1000"
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: '10px' }}>
                <input 
                  type="checkbox" 
                  id="isWelcomePromo" 
                  name="isWelcomePromo" 
                  checked={formData.isWelcomePromo} 
                  onChange={handleInputChange}
                  style={{ width: '20px', height: '20px', accentColor: '#0ea5e9' }}
                />
                <label htmlFor="isWelcomePromo" style={{ cursor: 'pointer', color: '#333', fontWeight: 500 }}>
                  Establecer como mensaje automático de Bienvenida
                </label>
              </div>
              
              <div className={styles.modalActions}>
                <button type="button" disabled={saving} className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" disabled={saving} className={styles.saveBtn}>{saving ? 'Guardando...' : 'Guardar Promo'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
