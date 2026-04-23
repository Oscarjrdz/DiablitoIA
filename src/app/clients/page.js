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

  // ── BORRADO TOTAL: Elimina cliente de Loyverse + toda su data en Redis ──
  const handleNukeClient = async (client) => {
    const phone = client.phone_number;
    const clientName = toTitleCase(client.name) || 'este cliente';
    
    if (!confirm(`⚠️ ¿Borrar COMPLETAMENTE a ${clientName}?\n\nEsto eliminará:\n• Su perfil de Loyverse\n• Su historial de chat\n• Sus cupones y folios\n• Todo rastro en el sistema\n\n¡Esta acción NO se puede deshacer!`)) return;
    
    const token = localStorage.getItem('loyverse_api_token');
    try {
      const res = await fetch('/api/loyverse/clients/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ phone: phone || '', id: client.id })
      });
      const data = await res.json();
      if (res.ok) {
        alert('✅ Cliente eliminado completamente del sistema.');
        fetchClients();
      } else {
        alert('Error al borrar: ' + (data.error || ''));
      }
    } catch (e) {
      alert('Error de conexión.');
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
        body: JSON.stringify({ phone, promoId })
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
              {sortedClients.map(client => {
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
    </div>
  );
}
