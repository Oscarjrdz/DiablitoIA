'use client';
import { useState } from 'react';

export default function DuplicadosPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [merging, setMerging] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const scan = async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/loyverse/merge-duplicates');
      const d = await res.json();
      if (d.success) setData(d);
      else showToast(d.error, 'error');
    } catch { showToast('Error de conexión', 'error'); }
    setLoading(false);
  };

  const merge = async (group, keepId) => {
    const deleteIds = group.customers.filter(c => c.id !== keepId).map(c => c.id);
    setMerging(keepId);
    try {
      const res = await fetch('/api/loyverse/merge-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId, deleteIds })
      });
      const d = await res.json();
      if (d.success) {
        showToast(`Fusionado ✅${d.pointsTransferred ? ` (+${d.pointsTransferred} pts transferidos)` : ''}`, 'success');
        setData(prev => ({
          ...prev,
          duplicates: prev.duplicates.filter(g => g.phone !== group.phone),
          duplicateGroups: prev.duplicateGroups - 1
        }));
      } else {
        showToast(d.error || 'Error al fusionar', 'error');
      }
    } catch { showToast('Error de conexión', 'error'); }
    setMerging(null);
  };

  const mergeAll = async () => {
    if (!data?.duplicates?.length) return;
    if (!confirm(`¿Fusionar automáticamente los ${data.duplicateGroups} grupos? Se conservará el cliente con más puntos en cada grupo.`)) return;
    setLoading(true);
    let count = 0;
    for (const group of data.duplicates) {
      const keep = group.customers.reduce((a, b) => (a.total_points >= b.total_points ? a : b));
      const deleteIds = group.customers.filter(c => c.id !== keep.id).map(c => c.id);
      try {
        await fetch('/api/loyverse/merge-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId: keep.id, deleteIds })
        });
        count++;
      } catch {}
    }
    showToast(`${count} grupos fusionados ✅`, 'success');
    await scan();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px', color: 'var(--text-primary)' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? '#ef4444' : '#00a884',
          color: '#fff', padding: '12px 20px', borderRadius: 10,
          fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
        }}>{toast.msg}</div>
      )}

      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>🔍 Clientes Duplicados</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 15 }}>
        Detecta y fusiona clientes con el mismo número de teléfono en Loyverse.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button onClick={scan} disabled={loading} style={btnStyle('#00a884')}>
          {loading ? 'Escaneando...' : '🔎 Escanear duplicados'}
        </button>
        {data?.duplicateGroups > 0 && (
          <button onClick={mergeAll} disabled={loading} style={btnStyle('#f59e0b')}>
            ⚡ Fusionar todos automáticamente
          </button>
        )}
      </div>

      {data && (
        <div style={{ marginBottom: 24, padding: '14px 20px', background: 'var(--bg-secondary)', borderRadius: 12, fontSize: 14 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total clientes escaneados: </span>
          <strong>{data.total}</strong>
          <span style={{ margin: '0 16px', color: 'var(--text-secondary)' }}>|</span>
          <span style={{ color: 'var(--text-secondary)' }}>Grupos duplicados: </span>
          <strong style={{ color: data.duplicateGroups > 0 ? '#ef4444' : '#00a884' }}>{data.duplicateGroups}</strong>
        </div>
      )}

      {data?.duplicates?.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: 16 }}>
          ✅ Sin duplicados encontrados
        </div>
      )}

      {data?.duplicates?.map(group => (
        <div key={group.phone} style={{
          background: 'var(--bg-secondary)', borderRadius: 14, padding: '20px 24px',
          marginBottom: 16, border: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span style={{ fontWeight: 700, fontSize: 16 }}>📱 {group.phone}</span>
              <span style={{ marginLeft: 12, background: '#ef444422', color: '#ef4444', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                {group.count} registros
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.customers.map(c => {
              const isBest = c.total_points === Math.max(...group.customers.map(x => x.total_points));
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '10px 14px', borderRadius: 10,
                  background: isBest ? 'rgba(0,168,132,0.08)' : 'rgba(120,120,128,0.06)',
                  border: isBest ? '1px solid rgba(0,168,132,0.3)' : '1px solid transparent'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {c.name || '(sin nombre)'}
                      {isBest && <span style={{ marginLeft: 8, fontSize: 11, color: '#00a884', fontWeight: 700 }}>★ CONSERVAR</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {c.phone_number} · {c.total_points} pts
                      {c.email && ` · ${c.email}`}
                      {c.address && ` · ${c.address}`}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.6, marginTop: 1 }}>
                      ID: {c.id} · Creado: {c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => merge(group, c.id)}
                    disabled={merging === c.id}
                    style={btnStyle('#00a884', true)}
                    title="Conservar este y eliminar los demás"
                  >
                    {merging === c.id ? '...' : 'Conservar este'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function btnStyle(color, small = false) {
  return {
    background: color, color: '#fff', border: 'none', borderRadius: 10,
    padding: small ? '7px 14px' : '11px 22px',
    fontSize: small ? 12 : 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0
  };
}
