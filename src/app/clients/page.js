'use client';

import React, { useState, useEffect } from 'react';
import styles from './page.module.css';

// ── Helpers de normalización visual ──
const toTitleCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|\/)\S/g, c => c.toUpperCase());
};

const formatPhone10 = (raw) => {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [stores, setStores] = useState([]);
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [welcomeStatus, setWelcomeStatus] = useState({});
  const [selectedPromo, setSelectedPromo] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;
  const [clientToDelete, setClientToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null); // { msg, type: 'success'|'error' }
  const [formData, setFormData] = useState({
    nombre: '',
    whatsapp: '',
    calle: '',
    numero_casa: '',
    colonia: '',
    municipio: '',
    tienda: ''
  });

  const fetchClients = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('loyverse_api_token');
      if (!token) return;

      const res = await fetch('/api/loyverse/clients', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setClients(data.data);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStores = async () => {
    try {
      const token = localStorage.getItem('loyverse_api_token');
      if (!token) return;
      const res = await fetch('/api/loyverse/stores', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data && data.data.stores) {
        setStores(data.data.stores);
      }
    } catch (error) {
      console.error('Error fetching stores:', error);
    }
  };

  const fetchPromos = async () => {
    try {
      const res = await fetch('/api/promotions');
      const data = await res.json();
      if (data.success) {
        setPromos(data.data);
      }
    } catch (error) {
      console.error('Error fetching promos:', error);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchStores();
    fetchPromos();
  }, []);

  // ── Sorting ──
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const getSortIndicator = (key) => {
    if (sortKey !== key) return ' ↕';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const getClientField = (client, key) => {
    switch (key) {
      case 'name': return (client.name || '').toLowerCase();
      case 'phone': return formatPhone10(client.phone_number);
      case 'tienda': return (client.tienda || '').toLowerCase();
      case 'calle': {
        if (!client.address) return '';
        const parts = client.address.split(',').map(s => s.trim());
        return (parts[0] || '').toLowerCase();
      }
      case 'numero': {
        if (!client.address) return '';
        const parts = client.address.split(',').map(s => s.trim());
        return parts.length >= 3 ? (parts[1] || '') : '';
      }
      case 'colonia': {
        if (!client.address) return '';
        const parts = client.address.split(',').map(s => s.trim());
        return parts.length >= 3 ? parts.slice(2).join(', ').toLowerCase() : '';
      }
      case 'municipio': return (client.city || '').toLowerCase();
      case 'fecha': return new Date(client.created_at || client.first_visit || 0).getTime();
      case 'visitas': return Number(client.total_visits || 0);
      case 'gasto': return Number(client.total_spent || 0);
      case 'puntos': return Number(client.total_points || client.points_balance || 0);
      case 'ultimaVisita': {
        const d = client.updated_at || client.last_visit;
        return d ? new Date(d).getTime() : 0;
      }
      default: return '';
    }
  };

  const sortedClients = React.useMemo(() => {
    if (!sortKey) return clients;
    const numericKeys = ['visitas', 'gasto', 'puntos', 'fecha', 'ultimaVisita'];
    const isNumeric = numericKeys.includes(sortKey);

    return [...clients].sort((a, b) => {
      const va = getClientField(a, sortKey);
      const vb = getClientField(b, sortKey);

      let cmp;
      if (isNumeric) {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [clients, sortKey, sortDir]);

  const totalPages = Math.ceil(sortedClients.length / PAGE_SIZE);
  const pagedClients = sortedClients.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const extractStore = async () => {
    if (!editingClient || !editingClient.id) return;
    setExtracting(true);
    try {
      const token = localStorage.getItem('loyverse_api_token');
      const res = await fetch('/api/loyverse/clients/sync-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ customerId: editingClient.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo deducir');
      if (data.storeName) {
        setFormData(prev => ({ ...prev, tienda: data.storeName }));
        alert(`¡Tienda deducida exitosamente: ${data.storeName}! Da clic en Guardar para conservar.`);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setExtracting(false);
    }
  };

  const openCreateModal = () => {
    setEditingClient(null);
    setFormData({ nombre: '', whatsapp: '', calle: '', numero_casa: '', colonia: '', municipio: '', tienda: '' });
    setShowModal(true);
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    let calle = '';
    let num = '';
    let col = '';

    if (client.address) {
      const parts = client.address.split(',').map(s => s.trim());
      if (parts.length >= 3) {
        calle = parts[0];
        num = parts[1];
        col = parts.slice(2).join(', ');
      } else {
        calle = client.address;
      }
    }

    setFormData({
      nombre: toTitleCase(client.name) || '',
      whatsapp: formatPhone10(client.phone_number) || '',
      calle: toTitleCase(calle),
      numero_casa: num,
      colonia: toTitleCase(col),
      municipio: toTitleCase(client.city) || '',
      tienda: client.tienda || ''
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('loyverse_api_token');
    
    try {
      let res;
      if (editingClient) {
        const payload = { id: editingClient.id, ...formData };
        res = await fetch('/api/loyverse/clients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/loyverse/clients', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(formData)
        });
      }
      
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar');
      }
      
      setShowModal(false);
      fetchClients();
    } catch (error) {
      console.error('Error saving client:', error);
      alert('Error guardando cliente: ' + (error.message || error));
    }
  };

  // ── Toast helper ──
  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Abre el modal de confirmación ──
  const handleNukeClient = (client) => setClientToDelete(client);

  // ── Ejecuta el borrado tras confirmar ──
  const confirmDelete = async () => {
    if (!clientToDelete) return;
    setDeleting(true);
    const token = localStorage.getItem('loyverse_api_token');
    try {
      const res = await fetch('/api/loyverse/clients/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: clientToDelete.phone_number || '', id: clientToDelete.id })
      });
      const data = await res.json();
      if (res.ok) {
        setClientToDelete(null);
        showToast(`${toTitleCase(clientToDelete.name)} eliminado del sistema.`, 'success');
        fetchClients();
      } else {
        showToast('Error al borrar: ' + (data.error || 'Intenta de nuevo.'), 'error');
      }
    } catch {
      showToast('Error de conexión.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  // ── ENVIAR CUPÓN SELECCIONADO AL CLIENTE ──
  const handleSendPromo = async (client) => {
    const phone = client.phone_number;
    if (!phone) {
      alert("Este cliente no tiene WhatsApp registrado.");
      return;
    }
    const promoId = selectedPromo[client.id];
    if (!promoId) {
      alert("Selecciona un cupón antes de enviar.");
      return;
    }
    setWelcomeStatus(prev => ({ ...prev, [client.id]: 'sending' }));
    setOpenDropdown(null);
    try {
      const token = localStorage.getItem('loyverse_api_token');
      const res = await fetch('/api/loyverse/clients/resend-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone, promoId, customerName: client.name })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWelcomeStatus(prev => ({ ...prev, [client.id]: 'success' }));
        setTimeout(() => {
          setWelcomeStatus(prev => ({ ...prev, [client.id]: null }));
          setSelectedPromo(prev => ({ ...prev, [client.id]: '' }));
        }, 4000);
      } else {
        alert(data.error || 'Error al enviar cupón');
        setWelcomeStatus(prev => ({ ...prev, [client.id]: null }));
      }
    } catch (e) {
      alert('Error de conexión al intentar enviar.');
      setWelcomeStatus(prev => ({ ...prev, [client.id]: null }));
    }
  };

  const renderStatusButton = (status) => {
    let color = '#ccc';
    let text = 'N/A';
    if (status === 'rojo') { color = '#ef4444'; text = 'No se mandó'; }
    if (status === 'naranja') { color = '#f97316'; text = 'Entregado'; }
    if (status === 'verde') { color = '#22c55e'; text = 'Visto'; }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: color }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555' }}>{text}</span>
      </div>
    );
  };

  const SortHeader = ({ label, sortId }) => (
    <th onClick={() => handleSort(sortId)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label}<span style={{ opacity: sortKey === sortId ? 1 : 0.3, fontSize: '0.7rem' }}>{getSortIndicator(sortId)}</span>
    </th>
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Clientes ({clients.length})</h1>
        <button className={styles.createBtn} onClick={openCreateModal}>
          Crear Cliente
        </button>
      </header>

      {loading ? (
        <p>Cargando clientes...</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <SortHeader label="Nombre" sortId="name" />
                <SortHeader label="WhatsApp" sortId="phone" />
                <SortHeader label="Registro" sortId="fecha" />
                <th>Cupón</th>
                <SortHeader label="Sucursal" sortId="tienda" />
                <th>Regalía</th>
                <SortHeader label="Calle" sortId="calle" />
                <SortHeader label="Municipio" sortId="municipio" />
                <SortHeader label="Visitas" sortId="visitas" />
                <SortHeader label="Última Visita" sortId="ultimaVisita" />
                <SortHeader label="Gasto Total" sortId="gasto" />
                <SortHeader label="Puntos" sortId="puntos" />
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedClients.map(client => {
                let calle = '';
                if (client.address) {
                  const parts = client.address.split(',').map(s => s.trim());
                  calle = parts[0] || client.address;
                }
                
                return (
                  <tr key={client.id}>
                    <td className={styles.nowrap}>{toTitleCase(client.name)}</td>
                    <td>{formatPhone10(client.phone_number)}</td>
                    <td className={styles.nowrap}>{client.created_at ? new Date(client.created_at).toLocaleDateString('es-MX', {day: '2-digit', month: 'short', year: '2-digit'}) : '-'}</td>
                    <td>{client.phone_number ? renderStatusButton(client.cuponStatus) : '-'}</td>
                    <td><span className={styles.badge}>{client.tienda || '-'}</span></td>
                    <td>
                      {welcomeStatus[client.id] === 'sending' ? (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', whiteSpace: 'nowrap' }}>⏳ Enviando...</span>
                      ) : welcomeStatus[client.id] === 'success' ? (
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>✅ Enviado</span>
                      ) : (
                        <div style={{ position: 'relative', minWidth: '120px' }}>
                          <button
                            onClick={() => setOpenDropdown(openDropdown === client.id ? null : client.id)}
                            style={{
                              background: selectedPromo[client.id] ? '#0ea5e9' : '#334155',
                              color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px',
                              fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                              whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', width: '100%',
                              justifyContent: 'space-between'
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '90px' }}>
                              {selectedPromo[client.id]
                                ? (promos.find(p => p.id === selectedPromo[client.id])?.itemName || 'Cupón')
                                : '🎟️ Seleccionar'}
                            </span>
                            <span style={{ fontSize: '0.6rem' }}>▼</span>
                          </button>
                          {openDropdown === client.id && (
                            <div style={{
                              position: 'absolute', top: '100%', left: 0, zIndex: 50,
                              background: '#1e293b', borderRadius: '8px', marginTop: '4px',
                              boxShadow: '0 10px 25px rgba(0,0,0,0.3)', minWidth: '200px',
                              border: '1px solid #334155', overflow: 'hidden'
                            }}>
                              {promos.length === 0 ? (
                                <div style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '0.75rem' }}>No hay promos activas</div>
                              ) : promos.map(p => (
                                <div
                                  key={p.id}
                                  onClick={() => {
                                    setSelectedPromo(prev => ({ ...prev, [client.id]: p.id }));
                                    setOpenDropdown(null);
                                  }}
                                  style={{
                                    padding: '8px 14px', cursor: 'pointer', fontSize: '0.75rem',
                                    color: selectedPromo[client.id] === p.id ? '#38bdf8' : '#e2e8f0',
                                    background: selectedPromo[client.id] === p.id ? '#0f172a' : 'transparent',
                                    borderBottom: '1px solid #334155',
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    transition: 'background 0.15s'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#334155'}
                                  onMouseLeave={e => e.currentTarget.style.background = selectedPromo[client.id] === p.id ? '#0f172a' : 'transparent'}
                                >
                                  <span>{p.isWelcomePromo ? '👋' : '🎁'}</span>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.itemName || 'Sin nombre'}</div>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '2px' }}>Vigencia: {p.validityDuration || 1} día(s)</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {selectedPromo[client.id] && (
                            <button
                              onClick={() => handleSendPromo(client)}
                              style={{
                                marginTop: '4px', width: '100%',
                                background: '#10b981', color: '#fff', border: 'none',
                                padding: '4px 8px', borderRadius: '4px',
                                fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              📤 Enviar Cupón
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td>{toTitleCase(calle)}</td>
                    <td>{toTitleCase(client.city)}</td>
                    <td>{client.total_visits || 0}</td>
                    <td className={styles.nowrap}>
                      {(() => {
                        const lastDate = client.updated_at || client.last_visit;
                        if (!lastDate || !client.total_visits) return <span style={{color:'#999'}}>—</span>;
                        const toMtyDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
                        const todayMty = toMtyDate(new Date());
                        const visitMty = toMtyDate(new Date(lastDate));
                        const diffDays = Math.round((new Date(todayMty) - new Date(visitMty)) / 86400000);
                        let color = '#22c55e';
                        if (diffDays > 30) color = '#ef4444';
                        else if (diffDays > 7) color = '#f97316';
                        const label = diffDays === 0 ? 'Hoy' : diffDays === 1 ? 'Ayer' : `${diffDays}d`;
                        return <span style={{color, fontWeight: 600, fontSize:'0.85rem'}}>{label}</span>;
                      })()}
                    </td>
                    <td className={styles.nowrap}>${Number(client.total_spent || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                    <td>{client.total_points || client.points_balance || 0}</td>
                    <td>
                      <div className={styles.actionsBox}>
                        <button className={styles.editBtn} onClick={() => openEditModal(client)}>Editar</button>
                        <button className={styles.deleteBtn} onClick={() => handleNukeClient(client)}>🗑️ Borrar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan="14" style={{textAlign: 'center', padding: '1rem'}}>
                    No hay clientes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '1rem 0', marginTop: '0.5rem' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: currentPage === 1 ? '#334155' : '#0ea5e9', color: '#fff', fontWeight: 700, cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1 }}
          >
            ← Anterior
          </button>
          <span style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>
            Página {currentPage} de {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: currentPage === totalPages ? '#334155' : '#0ea5e9', color: '#fff', fontWeight: 700, cursor: currentPage === totalPages ? 'default' : 'pointer', opacity: currentPage === totalPages ? 0.4 : 1 }}
          >
            Siguiente →
          </button>
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ margin: 0 }}>{editingClient ? 'Editar Cliente' : 'Crear Cliente'}</h2>
              {editingClient && (
                <button 
                  type="button" 
                  onClick={extractStore} 
                  disabled={extracting}
                  style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '6px 12px', borderRadius: '6px', fontWeight: 600, cursor: extracting ? 'wait' : 'pointer' }}
                >
                  {extracting ? 'Buscando...' : '📍 Auto-Extraer Tienda'}
                </button>
              )}
            </div>
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Nombre *</label>
                <input required type="text" name="nombre" value={formData.nombre} onChange={handleInputChange} />
              </div>
              <div className={styles.formGroup}>
                <label>WhatsApp</label>
                <input type="text" name="whatsapp" value={formData.whatsapp} onChange={handleInputChange} />
              </div>
              <div className={styles.formGroup}>
                <label>Sucursal de Registro</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select name="tienda" value={formData.tienda} onChange={handleInputChange} className={styles.selectInput}>
                    <option value="">-- Seleccionar --</option>
                    {stores.map(idx => (
                       <option key={idx.id} value={idx.name}>{idx.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.formGroup}>
                <label>Calle</label>
                <input type="text" name="calle" value={formData.calle} onChange={handleInputChange} />
              </div>
              <div className={styles.formGroup}>
                <label>Número de casa</label>
                <input type="text" name="numero_casa" value={formData.numero_casa} onChange={handleInputChange} />
              </div>
              <div className={styles.formGroup}>
                <label>Colonia</label>
                <input type="text" name="colonia" value={formData.colonia} onChange={handleInputChange} />
              </div>
              <div className={styles.formGroup}>
                <label>Municipio</label>
                <input type="text" name="municipio" value={formData.municipio} onChange={handleInputChange} />
              </div>
              
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className={styles.saveBtn}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de confirmación de borrado ── */}
      {clientToDelete && (
        <div className={styles.modalOverlay} onClick={() => !deleting && setClientToDelete(null)}>
          <div className={styles.deleteModal} onClick={e => e.stopPropagation()}>
            <div className={styles.deleteIconWrap}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>
            <h3 className={styles.deleteTitle}>¿Eliminar cliente?</h3>
            <p className={styles.deleteClientName}>{toTitleCase(clientToDelete.name)}</p>
            <ul className={styles.deleteList}>
              <li>Perfil en Loyverse</li>
              <li>Historial de chat</li>
              <li>Cupones y folios</li>
              <li>Todo rastro en el sistema</li>
            </ul>
            <p className={styles.deleteWarning}>Esta acción no se puede deshacer.</p>
            <div className={styles.deleteActions}>
              <button
                className={styles.cancelBtn}
                onClick={() => setClientToDelete(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                className={styles.confirmDeleteBtn}
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast de feedback ── */}
      {toast && (
        <div className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}>
          {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
        </div>
      )}
    </div>
  );
}
