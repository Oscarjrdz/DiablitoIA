"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';

export default function PredictionsPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [stores, setStores] = useState([]);

  const [selectedStore, setSelectedStore] = useState('');
  const [targetDate, setTargetDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [sortField, setSortField] = useState('forecastRevenue');
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const savedToken = localStorage.getItem('loyverse_api_token');
    if (savedToken) setToken(savedToken);
  }, []);

  const fetchForecast = async (storeOverride, dateOverride) => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const store = storeOverride ?? selectedStore;
      const date = dateOverride ?? targetDate;
      const res = await fetch(`/api/loyverse/predict?date=${date}&store=${store}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const json = await res.json();
      if (res.ok) {
        setData(json.data);
        if (store === 'all' && !selectedStore && json.data.store) {
          setSelectedStore(json.data.store);
        }
      } else {
        setError(json.error || 'Error al generar forecast');
      }
    } catch (err) {
      setError('Error de conexión al generar forecast');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetch('/api/loyverse/stores', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(r => r.json())
      .then(json => {
        if (json.data && json.data.stores) {
          setStores(json.data.stores);
        }
      })
      .catch(err => console.error("Error loading stores", err));
    }
  }, [token]);

  const handleStoreChange = (newStore) => {
    setSelectedStore(newStore);
  };

  const handleDateChange = (newDate) => {
    setTargetDate(newDate);
  };

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortArrow = (field) => {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const sortedPredictions = useMemo(() => {
    if (!data || !data.predictions) return [];
    return [...data.predictions]
      .filter(p => p.forecastUnits > 0)
      .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortField === 'forecastUnits') cmp = a.forecastUnits - b.forecastUnits;
      else if (sortField === 'avgUnits') cmp = a.avgUnits - b.avgUnits;
      else if (sortField === 'forecastRevenue') cmp = a.forecastRevenue - b.forecastRevenue;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortField, sortDir]);

  const totals = useMemo(() => {
    if (!sortedPredictions.length) return { units: 0, avg: 0, revenue: 0 };
    return {
      units: sortedPredictions.reduce((s, p) => s + p.forecastUnits, 0),
      avg: sortedPredictions.reduce((s, p) => s + p.avgUnits, 0),
      revenue: sortedPredictions.reduce((s, p) => s + (p.forecastRevenue || 0), 0)
    };
  }, [sortedPredictions]);

  const copyForWhatsApp = () => {
    if (!data || !sortedPredictions.length) return;
    const storeName = data.stores?.find(s => s.id === (selectedStore || data.store))?.name || selectedStore || data.store;
    const itemsToCopy = sortedPredictions.filter(p => p.forecastUnits > 0);
    if (!itemsToCopy.length) return;
    const totalUnits = itemsToCopy.reduce((s, p) => s + p.forecastUnits, 0);
    const totalRevenue = itemsToCopy.reduce((s, p) => s + (p.forecastRevenue || 0), 0);
    let text = `📊 *Forecast ${data.targetDayName} ${data.targetDate}*\n`;
    text += `🏠 ${storeName}\n\n`;
    itemsToCopy.forEach(p => {
      text += `▸ ${p.name}: *${p.forecastUnits} uds*\n`;
    });
    text += `\n━━━━━━━━━━━━━━━━\n`;
    text += `*Total: ${totalUnits} unidades*\n`;
    text += `*Venta estimada: ${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const confidenceStyle = (level) => {
    switch (level) {
      case 'alta': return { background: 'rgba(16, 185, 129, 0.15)', color: '#065F46', fontWeight: 600 };
      case 'media': return { background: 'rgba(245, 158, 11, 0.15)', color: '#92400E', fontWeight: 600 };
      case 'baja': return { background: 'rgba(239, 68, 68, 0.15)', color: '#991B1B', fontWeight: 600 };
      default: return {};
    }
  };

  if (!token) {
    return (
      <div className="animate-fade-in card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <h2>Predicciones Bloqueadas</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '1rem', marginBottom: '2rem' }}>
          Configura tu token de API de Loyverse en ajustes para ver predicciones.
        </p>
        <a href="/settings" className="btn btn-primary">Ir a Ajustes</a>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title">Predicción de Demanda</h1>
          <p className="page-subtitle" style={{ marginBottom: 0 }}>
            Forecast de unidades vendidas por producto usando WMA con 8 semanas de historial.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ flex: '65 1 0%', minWidth: '130px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Sucursal</label>
            <select 
              className="form-input" 
              style={{ padding: '0.5rem', width: '100%' }}
              value={selectedStore}
              onChange={(e) => handleStoreChange(e.target.value)}
            >
              
              {stores.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '35 1 0%', minWidth: '120px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Fecha objetivo</label>
            <input 
              type="date" 
              className="form-input" 
              style={{ padding: '0.5rem', width: '100%' }}
              value={targetDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', flex: '1 1 100%' }}>
            <button 
              onClick={() => fetchForecast()} 
              style={{ padding: '0.5rem 1rem', background: '#10B981', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', height: '36px', width: '100%' }}
            >
              Generar predicción
            </button>
          </div>
        </div>
      </div>

      {error && <div style={{ color: '#991B1B', background: '#FEF2F2', padding: '1rem', borderRadius: '8px', marginBottom: '2rem' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>Analizando 8 semanas de historial para {data?.targetDayName || 'el día seleccionado'}...</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Aplicando WMA + filtro de outliers IQR</div>
        </div>
      ) : data ? (
        <>
          {/* KPI Cards */}
          {/* KPI Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
            {/* HERO MODULE: Venta Forecast Centric */}
            <div className="card" style={{ 
              background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)', 
              color: 'white', 
              border: 'none', 
              padding: '24px', 
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)' 
            }}>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Venta Forecast</div>
                <div style={{ fontSize: '3.5rem', fontWeight: 800, margin: '0.2rem 0', color: '#10B981', lineHeight: 1 }}>
                  ${data.totalForecastRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                {data.activeCount > 0 && <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '8px' }}>Promedio histórico base: ${data.activeSumRev?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / {data.activeCount} días</div>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                {/* 50% Izquierda */}
                <div style={{ flex: '1 1 45%', borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha Objetivo</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 700, margin: '0.2rem 0', color: 'white' }}>{data.targetDate}</div>
                  <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#10B981', textTransform: 'capitalize' }}>{data.targetDayName}</div>
                </div>

                {/* 50% Derecha */}
                <div style={{ flex: '1 1 45%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unidades Forecast</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>{data.totalForecastUnits} <span style={{fontSize: '0.9rem', color: '#6b7280', fontWeight: 500}}>uds</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Semanas Analizadas</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'white' }}>{data.weeksAnalyzed} <span style={{fontSize: '0.9rem', color: '#6b7280', fontWeight: 500}}>de 8</span></div>
                  </div>
                </div>
              </div>
            </div>

            {/* HISTÓRICO BASE CARD */}
            <div className="card" style={{ borderLeft: '4px solid #818cf8', background: 'var(--bg-primary)' }}>
              <div style={{ fontSize: '0.875rem', color: 'white', fontWeight: 600, marginBottom: '0.75rem' }}>
                Calendario Base: {data.targetDayName}s
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {data.historicalDays?.map((day, i) => (
                  <div key={i} title={day.reason ? `Descartado: ${day.reason}` : 'Utilizado en el promedio'} style={{ 
                    background: day.discarded ? 'transparent' : 'rgba(255, 255, 255, 0.1)',
                    padding: '0.4rem', 
                    borderRadius: '6px',
                    border: day.discarded ? '1px dashed #4b5563' : '1px solid rgba(255, 255, 255, 0.2)',
                    opacity: day.discarded ? 0.6 : 1,
                    flex: '1 1 calc(25% - 0.5rem)',
                    minWidth: '65px'
                  }}>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      color: day.discarded ? '#9ca3af' : '#a78bfa',
                      fontWeight: 600,
                      textDecoration: day.discarded ? 'line-through' : 'none'
                    }}>{day.label}</div>
                    <div style={{ 
                      fontSize: '0.85rem', 
                      fontWeight: 700, 
                      color: day.discarded ? '#9ca3af' : 'white',
                      textDecoration: day.discarded ? 'line-through' : 'none'
                    }}>
                      ${Math.round(day.val).toLocaleString('en-US')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Forecast Table */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
            <button 
              onClick={copyForWhatsApp}
              style={{ 
                padding: '8px 20px', 
                borderRadius: '8px', 
                border: 'none', 
                background: copied ? '#10B981' : '#4F46E5', 
                color: 'white', 
                cursor: 'pointer', 
                fontSize: '0.85rem', 
                fontWeight: 600,
                transition: 'all 0.2s',
                boxShadow: '0 2px 8px rgba(79,70,229,0.3)'
              }}
            >
              {copied ? '✓ Copiado!' : '📋 Copiar para WhatsApp'}
            </button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', maxWidth: '100vw' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>Forecast por Producto</span>
            </div>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th onClick={() => toggleSort('name')} style={{ textAlign: 'left', padding: '12px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', width: '50%' }}>Producto{sortArrow('name')}</th>
                    <th onClick={() => toggleSort('forecastUnits')} style={{ textAlign: 'center', padding: '12px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', width: '25%' }}>Forecast{sortArrow('forecastUnits')}</th>
                    <th onClick={() => toggleSort('forecastRevenue')} style={{ textAlign: 'right', padding: '12px 10px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', width: '25%' }}>Venta{sortArrow('forecastRevenue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPredictions.map((p, idx) => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                      <td style={{ padding: '14px 10px', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</td>
                      <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                        <span style={{ background: 'rgba(79, 70, 229, 0.1)', color: '#818cf8', padding: '4px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '0.9rem' }}>
                          {p.forecastUnits}
                        </span>
                      </td>
                      <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {"$"}{p.forecastRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {sortedPredictions.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No hay datos históricos para {data.targetDayName}s en las últimas 8 semanas.
                      </td>
                    </tr>
                  )}
                  {sortedPredictions.length > 0 && (
                    <tr style={{ borderTop: '2px solid var(--border-color)', background: 'var(--bg-secondary)', fontWeight: 700 }}>
                      <td style={{ padding: '14px 10px', color: 'var(--text-primary)' }}>TOTAL</td>
                      <td style={{ padding: '14px 10px', textAlign: 'center' }}>
                        <span style={{ background: 'rgba(79, 70, 229, 0.15)', color: '#818cf8', padding: '4px 8px', borderRadius: '6px', fontWeight: 700 }}>
                          {totals.units}
                        </span>
                      </td>
                      <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        {"$"}{totals.revenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <strong>Resumen:</strong> Para el {data.targetDayName} {data.targetDate}, se analizaron <strong>{data.weeksAnalyzed}</strong> {data.targetDayName}s equivalentes en las últimas 8 semanas. 
            Se proyecta un total de <strong>{data.totalForecastUnits} unidades</strong> distribuidas en <strong>{data.totalProducts} productos</strong>.
            Los outliers fueron eliminados automáticamente usando IQR. Los pesos del WMA priorizan las semanas más recientes.
          </div>
        </>
      ) : null}
    </div>
  );
}
