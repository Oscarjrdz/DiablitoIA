"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { format, startOfMonth, parseISO, startOfDay, endOfDay, differenceInCalendarDays, getDaysInMonth } from 'date-fns';
import { Calendar, Store as StoreIcon, Activity, TrendingUp, Clock, PieChart } from 'lucide-react';
import DateRangePicker from './components/DateRangePicker';

function fmt(n) {
  return typeof n === 'number' ? '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '$0.00';
}

function DesktopKpiCard({ title, ventasBrutas, daysInRange, daysInMonth, color, ventasHoy, totalTickets, papasStats, loading, ventasLastYear, lastTicketInfo, firstTicketInfo, rangeIncludesToday }) {
  // Días terminados: excluye hoy si el rango incluye el día actual (día en curso)
  const diasTerminados = rangeIncludesToday ? Math.max(daysInRange - 1, 0) : daysInRange;
  const ventasTerminadas = rangeIncludesToday ? ventasBrutas - (ventasHoy || 0) : ventasBrutas;
  const promedioDiario = diasTerminados > 0 ? ventasTerminadas / diasTerminados : 0;
  const proyeccionMensual = promedioDiario * daysInMonth;
  const ticketPromedio = (totalTickets || 0) > 0 ? ventasBrutas / totalTickets : 0;
  
  return (
    <div className="card" style={{ borderLeft: `5px solid ${color}`, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', padding: '24px' }}>
      <div style={{ fontSize: '15px', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <TrendingUp size={18} color={color} />
        {title}
      </div>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '32px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.5px', marginBottom: '8px' }}>
          {fmt(ventasBrutas)}
        </div>
        {ventasLastYear !== undefined && ventasLastYear !== null && (() => {
          const diff = ventasBrutas - ventasLastYear;
          const pctChange = ventasLastYear > 0 ? ((diff / ventasLastYear) * 100).toFixed(1) : (ventasBrutas > 0 ? '100.0' : '0.0');
          const isUp = diff >= 0;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '4px 10px', borderRadius: '8px', fontSize: '13px', fontWeight: 700,
                background: isUp ? 'rgba(52, 199, 89, 0.15)' : 'rgba(255, 59, 48, 0.15)',
                color: isUp ? 'var(--success)' : 'var(--danger)'
              }}>
                {isUp ? '▲' : '▼'} {pctChange}%
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                vs Año Ant. ({fmt(ventasLastYear)})
              </span>
            </div>
          );
        })()}
      </div>
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Promedio diario</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.7 }}>{diasTerminados} días cerrados</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-color)' }}>{fmt(promedioDiario)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Proyección mes</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.7 }}>{daysInMonth} días</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success)' }}>{fmt(proyeccionMensual)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>Ticket promedio</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', opacity: 0.7 }}>{totalTickets || 0} tickets</span>
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--warning)' }}>{fmt(ticketPromedio)}</span>
        </div>
        
        {papasStats && (
          <div style={{ background: 'var(--bg-primary)', padding: '12px 14px', borderRadius: '10px', marginTop: '6px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>🍟 Criscut ({papasStats.criscut.qty.toLocaleString()})</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--purple)' }}>{fmt(papasStats.criscut.total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>🍟 Gajo ({papasStats.gajo.qty.toLocaleString()})</span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--purple)' }}>{fmt(papasStats.gajo.total)}</span>
            </div>
          </div>
        )}
        
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px dashed var(--border-color)', paddingTop: '14px', marginTop: '6px', gap: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>📅 Venta Hoy</span>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(ventasHoy)}</span>
          </div>
          {lastTicketInfo && (
             <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
               <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                 UT: {lastTicketInfo.time.replace(/ (a\.?m\.?|p\.?m\.?|AM|PM)/i, '').trim()} ({fmt(lastTicketInfo.amount)})
               </span>
             </div>
          )}
          {title !== 'Todas las Sucursales' && firstTicketInfo && (
             <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
               <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                 Hora Apertura: {firstTicketInfo.time.replace(/ (a\.?m\.?|p\.?m\.?|AM|PM)/i, '').trim()}
               </span>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}

const STORE_COLORS = ['#4F46E5', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899'];

export default function DashboardPage() {
  const [token, setToken] = useState('');
  const [dashboardData, setDashboardData] = useState(null);
  const [todayData, setTodayData] = useState(null);
  const [lastYearData, setLastYearData] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [dateRange, setDateRange] = useState({
    start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end: todayStr
  });
  
  const [selectedStore, setSelectedStore] = useState('all');
  const [showDatePicker, setShowDatePicker] = useState(false);
  

  const toggleGroup = (groupName) => {
    setExpandedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  useEffect(() => {
    const savedToken = localStorage.getItem('loyverse_api_token');
    if (savedToken) setToken(savedToken);
  }, []);

  useEffect(() => {
    if (!token) return;
    
    const fetchAll = async () => {
      setLoading(true);
      setError('');
      try {
        const [sy, sm, sd] = dateRange.start.split('-');
        const [ey, em, ed] = dateRange.end.split('-');
        const startIso = startOfDay(new Date(sy, parseInt(sm)-1, sd)).toISOString();
        const endIso = endOfDay(new Date(ey, parseInt(em)-1, ed)).toISOString();

        const lastYearStartIso = startOfDay(new Date(parseInt(sy)-1, parseInt(sm)-1, sd)).toISOString();
        const lastYearEndIso = endOfDay(new Date(parseInt(ey)-1, parseInt(em)-1, ed)).toISOString();

        const todayStart = startOfDay(new Date()).toISOString();
        const todayEnd = endOfDay(new Date()).toISOString();

        const [rangeRes, todayRes, lastYearRes] = await Promise.all([
          fetch(`/api/loyverse/dashboard?start=${startIso}&end=${endIso}&store=${selectedStore}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/api/loyverse/dashboard?start=${todayStart}&end=${todayEnd}&store=${selectedStore}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/api/loyverse/dashboard?start=${lastYearStartIso}&end=${lastYearEndIso}&store=${selectedStore}`, {
             headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        const rangeDataRes = await rangeRes.json();
        const todayDataRes = await todayRes.json();
        const lastYearDataRes = await lastYearRes.json();

        if (rangeRes.ok) {
          setDashboardData(rangeDataRes.data);
        } else {
          setError(rangeDataRes.error || 'Error fetching data');
        }
        if (todayRes.ok) {
          setTodayData(todayDataRes.data);
        }
        if (lastYearRes.ok) {
          setLastYearData(lastYearDataRes.data);
        }
      } catch (err) {
        setError('Connection error fetching dashboard data');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [token, dateRange, selectedStore]);

  // Refresh today's data every 5 minutes automatically
  useEffect(() => {
    if (!token) return;
    const interval = setInterval(async () => {
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();
      try {
        const res = await fetch(`/api/loyverse/dashboard?start=${todayStart}&end=${todayEnd}&store=${selectedStore}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const dataRes = await res.json();
        if (res.ok) setTodayData(dataRes.data);
      } catch {}
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token, selectedStore]);

  const { daysInRange, daysInMonth, rangeIncludesToday } = useMemo(() => {
    const [sy, sm, sd] = dateRange.start.split('-');
    const [ey, em, ed] = dateRange.end.split('-');
    const rangeStart = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
    const rangeEnd = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed));
    const today = new Date();
    const todayNorm = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return {
      daysInRange: differenceInCalendarDays(rangeEnd, rangeStart) + 1,
      daysInMonth: getDaysInMonth(rangeEnd),
      rangeIncludesToday: rangeEnd >= todayNorm && rangeStart <= todayNorm
    };
  }, [dateRange]);

  if (!token) {
    return (
      <div className="animate-fade-in card" style={{ textAlign: 'center', padding: '60px 20px', margin: 'auto', maxWidth: '400px', marginTop: '10vh' }}>
        <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px' }}>Bienvenido</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '15px' }}>
          Configura tu API Token de Loyverse en Ajustes para ver las estadísticas.
        </p>
        <a href="/settings" className="btn btn-primary">Ir a Configuración</a>
      </div>
    );
  }

  // Fallback defaults mapping exactly like mobile
  const allStoresKpi = dashboardData?.allStoresKpi || { ventasBrutas: 0, totalTickets: 0, papasStats: null };
  const allStoresToday = todayData?.allStoresKpi?.ventasBrutas || 0;
  
  const ventasPorDia = dashboardData?.ventasPorDia || [];
  const ventasPorHora = dashboardData?.ventasPorHora || [];
  const productGrid = dashboardData?.productGrid || [];
  const storeKpis = dashboardData?.storeKpis || [];

  return (
    <div className="animate-fade-in">
      {/* Header section (iOS Style) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Resumen El Diablito</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>Rendimiento global del negocio</p>
        </div>
        
        {/* iOS style filters */}
        <div className="mobile-stack" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div className="ios-segmented-control" style={{ alignItems: 'center', padding: '0px', background: 'transparent' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: '12px', gap: '8px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', width: '100%' }}>
              <StoreIcon size={18} color="var(--text-secondary)" />
              <select 
                style={{ border: 'none', background: 'transparent', fontSize: '14px', fontWeight: 500, outline: 'none', color: 'var(--text-primary)', cursor: 'pointer', flex: 1 }}
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                disabled={loading}
              >
                <option value="all">Todas las Tiendas</option>
                {dashboardData?.stores?.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', padding: '10px 16px', borderRadius: '12px', gap: '8px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', fontSize: '14px', fontWeight: 500, width: '100%' }}
              onClick={() => setShowDatePicker(true)}
            >
              <Calendar size={18} color="var(--accent-color)" />
              {format(parseISO(dateRange.start), 'dd MMM yyyy')} - {format(parseISO(dateRange.end), 'dd MMM yyyy')}
            </div>

            
            {showDatePicker && (
              <DateRangePicker 
                initialStart={parseISO(dateRange.start)}
                initialEnd={parseISO(dateRange.end)}
                onCancel={() => setShowDatePicker(false)}
                onApply={({ start, end }) => {
                  setDateRange({ start, end });
                  setShowDatePicker(false);
                }}
              />
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(255, 59, 48, 0.1)', color: 'var(--danger)', padding: '16px', borderRadius: '12px', marginBottom: '24px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={20} />
          {error}
        </div>
      )}

      {!dashboardData && loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}></div>
          Loading intelligence...
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      ) : dashboardData && (
        <>
          {/* Main Mobile-style KPIs but wrapped in grid */}
          <div className="kpi-grid">
            <DesktopKpiCard 
              title={selectedStore === 'all' ? "Todas las sucursales" : dashboardData.stores?.find(s => s.id === selectedStore)?.name || "Sucursal seleccionada"} 
              ventasBrutas={allStoresKpi.ventasBrutas} 
              daysInRange={daysInRange} 
              daysInMonth={daysInMonth} 
              color="#4F46E5" 
              ventasHoy={allStoresToday} 
              totalTickets={allStoresKpi.totalTickets} 
              papasStats={allStoresKpi.papasStats} 
              loading={loading}
              ventasLastYear={selectedStore === 'all' ? lastYearData?.allStoresKpi?.ventasBrutas : lastYearData?.storeKpis?.find(s => s.id === selectedStore)?.ventasBrutas}
              lastTicketInfo={allStoresKpi.lastTicketInfo}
              firstTicketInfo={selectedStore === 'all' ? null : dashboardData.storeKpis?.find(s => s.id === selectedStore)?.firstTicketInfo}
              rangeIncludesToday={rangeIncludesToday}
            />
            {/* Si es 'Todas las Tiendas', listamos las individuales como en el móvil */}
            {selectedStore === 'all' && storeKpis.map((store, idx) => {
              const todayStore = todayData?.storeKpis?.find(s => s.id === store.id);
              const ventasHoy = todayStore?.ventasBrutas || 0;
              return (
                <DesktopKpiCard 
                  key={store.name} 
                  title={store.name} 
                  ventasBrutas={store.ventasBrutas}
                  daysInRange={daysInRange} 
                  daysInMonth={daysInMonth} 
                  color={STORE_COLORS[idx % STORE_COLORS.length]}
                  ventasHoy={ventasHoy} 
                  totalTickets={store.totalTickets} 
                  papasStats={store.papasStats} 
                  loading={loading}
                  ventasLastYear={lastYearData?.storeKpis?.find(s => s.id === store.id)?.ventasBrutas}
                  lastTicketInfo={store.lastTicketInfo}
                  firstTicketInfo={store.firstTicketInfo}
              rangeIncludesToday={rangeIncludesToday}
                />
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            
            {/* Sales by Day (Mobile replica) */}
            <div className="card" style={{ padding: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', borderLeft: '5px solid #F59E0B' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '24px' }}>
                <Calendar size={18} color="#F59E0B" />
                <span style={{ fontSize: '16px', fontWeight: 600 }}>Por día de la semana</span>
                <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>Σ {fmt(ventasPorDia.reduce((s,x)=>s+x.venta, 0))}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ventasPorDia.map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', width: '36px', flexShrink: 0 }}>{row.label}</span>
                    <div className="progress-container" style={{ height: '8px', background: 'var(--bg-primary)' }}>
                      <div className="progress-bar" style={{ width: (row.bar * 0.95) + '%', backgroundColor: '#F59E0B' }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', width: '100px', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                      ${row.venta.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span style={{ color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '4px' }}>{row.pct}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sales by Hour (Mobile replica) */}
            <div className="card" style={{ padding: '24px', opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', borderLeft: '5px solid #EF4444' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)', marginBottom: '24px' }}>
                <Clock size={18} color="#EF4444" />
                <span style={{ fontSize: '16px', fontWeight: 600 }}>Por hora del día</span>
                <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>Σ {fmt(ventasPorHora.reduce((s,x)=>s+x.venta, 0))}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ventasPorHora.length === 0 && <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>No hay movimientos computados localmente.</div>}
                {ventasPorHora.map(row => (
                  <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', width: '42px', flexShrink: 0 }}>{row.label}</span>
                    <div className="progress-container" style={{ height: '8px', background: 'var(--bg-primary)' }}>
                      <div className="progress-bar" style={{ width: (row.bar * 0.95) + '%', backgroundColor: '#EF4444' }} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', width: '100px', whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>
                      ${row.venta.toLocaleString('en-US', { maximumFractionDigits: 0 })} <span style={{ color: 'var(--text-secondary)', fontWeight: 500, marginLeft: '4px' }}>{row.pct}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Product Grid (Mobile replica expanded view) */}
          <div className="card" style={{ padding: 0, opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s', borderLeft: '5px solid #8B5CF6' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PieChart size={18} color="#8B5CF6" />
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Por producto</span>
              <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700, color: 'var(--text-secondary)' }}>Σ {fmt(productGrid.reduce((s,x)=>s+x.total, 0))}</span>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 700, color: 'var(--text-secondary)', width: '55%' }}>Producto</th>
                    <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: '20%' }}>Cant.</th>
                    <th style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 700, color: 'var(--text-secondary)', whiteSpace: 'nowrap', width: '25%' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {productGrid.map((p, i) => {
                    const isExpanded = expandedGroups[p.name];
                    return (
                      <React.Fragment key={p.name}>
                        <tr 
                          onClick={() => p.isGroup && toggleGroup(p.name)}
                          style={{ 
                            borderBottom: p.isGroup && isExpanded ? 'none' : '1px solid var(--border-color)', 
                            background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                            cursor: p.isGroup ? 'pointer' : 'default',
                            WebkitTapHighlightColor: 'transparent'
                          }}>
                          <td style={{ padding: '12px 8px', color: 'var(--text-primary)', fontWeight: p.isGroup ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {p.isGroup && (
                              <span style={{ fontSize: '12px', color: '#8B5CF6', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block', marginRight: '8px' }}>▶</span>
                            )}
                            {p.name}
                          </td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--accent-color)' }}>{p.quantity.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fmt(p.total)}</td>
                        </tr>
                        {p.isGroup && isExpanded && p.items.map((subItem, idx) => (
                          <tr key={subItem.name} style={{ borderBottom: idx === p.items.length - 1 ? '1px solid var(--border-color)' : 'none', background: i % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)' }}>
                            <td style={{ padding: '8px 8px 12px 32px', color: 'var(--text-secondary)', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>↳ {subItem.name}</td>
                            <td style={{ padding: '8px 8px 12px 8px', textAlign: 'center', fontWeight: 500, color: 'var(--accent-color)', fontSize: '12px' }}>{subItem.quantity.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                            <td style={{ padding: '8px 8px 12px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '12px' }}>{fmt(subItem.total)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        
          
        </>
      )}
    </div>
  );
}
