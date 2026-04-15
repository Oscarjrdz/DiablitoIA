"use client";
import React, { useState, useEffect } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function MonthlySalesChart({ storeId, token }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncProgress, setSyncProgress] = useState(null);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        if (!token) throw new Error("Falta el token de autorización");
        
        const params = new URLSearchParams();
        if (storeId) params.append('store', storeId);
        
        let res = await fetch(`/api/loyverse/monthly?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) {
          let errText;
          try {
            const e = await res.clone().json();
            errText = e.error || JSON.stringify(e);
          } catch {
            errText = await res.text();
          }
          throw new Error(errText || `Error HTTP ${res.status}`);
        }
        
        let result = await res.json();

        if (result.needsSync && result.missingMonths) {
          const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
          for (let i = 0; i < result.missingMonths.length; i++) {
            const m = result.missingMonths[i];
            if (isMounted) {
              setSyncProgress({
                current: i + 1,
                total: result.missingMonths.length,
                year: m.year,
                monthName: monthNames[m.month]
              });
            }
            
            const syncParams = new URLSearchParams(params);
            syncParams.append('syncYear', m.year);
            syncParams.append('syncMonth', m.month);

            let syncSuccess = false;
            let retries = 0;
            while (!syncSuccess && retries < 3) {
              try {
                const syncRes = await fetch(`/api/loyverse/monthly?${syncParams.toString()}`, {
                   headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!syncRes.ok) throw new Error(`Fallo sincronizando ${monthNames[m.month]} ${m.year}`);
                syncSuccess = true;
              } catch (retryErr) {
                retries++;
                if (retries >= 3) throw retryErr;
                await new Promise(r => setTimeout(r, 1500)); // Esperar 1.5s antes de reintentar
              }
            }
            
            // Safety wait for Loyverse WAF
            await new Promise(r => setTimeout(r, 350));
          }
          
          if (isMounted) setSyncProgress(null);
          
          // Re-fetch final compiled dashboard
          res = await fetch(`/api/loyverse/monthly?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (!res.ok) throw new Error('Fallo cargando vista final compilada');
          result = await res.json();
        }

        if (isMounted) setData(result);

      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    fetchData();
    return () => { isMounted = false };
  }, [storeId, token]);

  if (loading) {
    return (
      <div className="card" style={{ marginTop: '2rem', height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-secondary)', flexDirection: 'column' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 1rem auto' }}></div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {syncProgress 
              ? `Sincronizando mes histórico (${syncProgress.current} de ${syncProgress.total})` 
              : 'Verificando caché histórico...'}
          </p>
          {syncProgress && (
            <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.1rem' }}>
              {syncProgress.monthName} {syncProgress.year}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ marginTop: '2rem', background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
        <p style={{ color: '#991B1B', fontWeight: 600 }}>Error cargando la vista mensual:</p>
        <p style={{ color: '#991B1B', fontSize: '0.9rem', wordBreak: 'break-all' }}>{error}</p>
      </div>
    );
  }

  if (!data || !data.chartData) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: '1rem', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          <p style={{ fontWeight: 700, margin: '0 0 10px 0', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '4px' }}>{label}</p>
          {payload.map((entry, index) => {
            const isMoney = entry.dataKey.includes('sales') || entry.dataKey.includes('avg');
            const val = isMoney ? `$${entry.value.toLocaleString()}` : entry.value.toLocaleString();
            return (
              <p key={index} style={{ color: entry.color, margin: '4px 0', fontSize: '0.85rem', fontWeight: 600 }}>
                {entry.name}: {val}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card animate-fade-in" style={{ marginTop: '2rem', padding: '1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Análisis Mensual (Año a la Fecha)</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          Comparando {data.summary?.currentYear} vs {data.summary?.lastYear}
        </p>
      </div>

      {/* KPI Banderas YTD */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        
        {/* Ventas */}
        <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Venta Total (YTD)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10B981' }}>
            ${Math.round(data.summary?.ytdSalesCurrent || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.85rem', color: data.summary?.ytdGrowth >= 0 ? '#10B981' : '#EF4444', marginTop: '4px', fontWeight: 500 }}>
            {data.summary?.ytdGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.summary?.ytdGrowth || 0).toFixed(1)}% vs {data.summary?.lastYear} 
            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>(${Math.round(data.summary?.ytdSalesLast || 0).toLocaleString()})</span>
          </div>
        </div>

        {/* Tickets */}
        <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Total Tickets (YTD)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6366f1' }}>
            {(data.summary?.ytdTicketsCurrent || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.85rem', color: data.summary?.tktGrowth >= 0 ? '#10B981' : '#EF4444', marginTop: '4px', fontWeight: 500 }}>
            {data.summary?.tktGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.summary?.tktGrowth || 0).toFixed(1)}% vs {data.summary?.lastYear}
            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>({(data.summary?.ytdTicketsLast || 0).toLocaleString()})</span>
          </div>
        </div>

        {/* Ticket Promedio */}
        <div style={{ background: 'var(--bg-primary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Ticket Promedio (YTD)</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
            ${Math.round(data.summary?.ytdAvgCurrent || 0).toLocaleString()}
          </div>
          <div style={{ fontSize: '0.85rem', color: data.summary?.avgGrowth >= 0 ? '#10B981' : '#EF4444', marginTop: '4px', fontWeight: 500 }}>
            {data.summary?.avgGrowth >= 0 ? '↑' : '↓'} {Math.abs(data.summary?.avgGrowth || 0).toFixed(1)}% vs {data.summary?.lastYear}
            <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>(${Math.round(data.summary?.ytdAvgLast || 0).toLocaleString()})</span>
          </div>
        </div>

      </div>

      <div style={{ width: '100%', height: 400 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data.chartData}
            margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
            <XAxis dataKey="name" stroke="var(--text-secondary)" tick={{fontSize: 12}} dy={10} />
            
            {/* Left Axis for Sales */}
            <YAxis 
              yAxisId="left" 
              tickFormatter={(val) => `$${val/1000}k`} 
              stroke="var(--text-secondary)" 
              tick={{fontSize: 12}} 
              dx={-5}
            />
            {/* Right Axis for Tickets & Avg */}
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              stroke="var(--text-secondary)" 
              tick={{fontSize: 12}} 
              dx={5}
            />

            <Tooltip content={<CustomTooltip />} />
            
            <Legend wrapperStyle={{ paddingTop: '20px' }} />

            {/* Barras de Venta Totales */}
            <Bar yAxisId="left" dataKey="salesLast" name={`Ventas ${data.summary?.lastYear}`} fill="rgba(16, 185, 129, 0.2)" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="salesCurrent" name={`Ventas ${data.summary?.currentYear}`} fill="#10B981" radius={[4, 4, 0, 0]} />

            {/* Lineas de Tickets Totales */}
            <Line yAxisId="right" type="monotone" dataKey="tktLast" name={`Tickets ${data.summary?.lastYear}`} stroke="rgba(99, 102, 241, 0.4)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="tktCurrent" name={`Tickets ${data.summary?.currentYear}`} stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />

            {/* Lineas de Ticket Promedio */}
            <Line yAxisId="right" type="monotone" dataKey="avgLast" name={`T. Promedio ${data.summary?.lastYear}`} stroke="rgba(245, 158, 11, 0.4)" strokeDasharray="5 5" strokeWidth={2} dot={false} />
            <Line yAxisId="right" type="monotone" dataKey="avgCurrent" name={`T. Promedio ${data.summary?.currentYear}`} stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />

          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
