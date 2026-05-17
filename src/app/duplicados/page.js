'use client';
import { useState } from 'react';

// ── estilos compartidos ──
function btnStyle(color, small = false) {
  return {
    background: color, color: '#fff', border: 'none', borderRadius: 10,
    padding: small ? '6px 12px' : '11px 22px',
    fontSize: small ? 12 : 14, fontWeight: 700, cursor: 'pointer',
    fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0
  };
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{
      position: 'fixed', top: 24, right: 24, zIndex: 9999,
      background: toast.type === 'error' ? '#ef4444' : '#00a884',
      color: '#fff', padding: '12px 20px', borderRadius: 10,
      fontWeight: 600, fontSize: 14, boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
    }}>{toast.msg}</div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
      borderRadius: 12, padding: '14px 20px', minWidth: 120, textAlign: 'center'
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// TAB 1 — Duplicados en Loyverse
// ═══════════════════════════════════════════════
function TabDuplicados() {
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
    if (!confirm(`¿Fusionar automáticamente los ${data.duplicateGroups} grupos? Se conservará el cliente con más puntos.`)) return;
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
    <>
      <Toast toast={toast} />
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
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
          <StatBox label="Total Loyverse" value={data.total} />
          <StatBox label="Grupos duplicados" value={data.duplicateGroups} color={data.duplicateGroups > 0 ? '#ef4444' : '#00a884'} />
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
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>📱 {group.phone}</span>
            <span style={{ marginLeft: 12, background: '#ef444422', color: '#ef4444', borderRadius: 8, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
              {group.count} registros
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {group.customers.map(c => {
              const isBest = c.total_points === Math.max(...group.customers.map(x => x.total_points));
              return (
                <div key={c.id} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px', borderRadius: 10,
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
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', opacity: 0.6, marginTop: 1 }}>
                      ID: {c.id} · {c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '—'}
                    </div>
                  </div>
                  <button onClick={() => merge(group, c.id)} disabled={merging === c.id} style={btnStyle('#00a884', true)}>
                    {merging === c.id ? '...' : 'Conservar este'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

// ═══════════════════════════════════════════════
// TAB 2 — Comparar Loyverse vs Redis
// ═══════════════════════════════════════════════
function TabComparar() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState(null);
  const [fixing, setFixing] = useState(null);
  const [toast, setToast] = useState(null);
  const [section, setSection] = useState('mismatch'); // mismatch | onlyRedis | onlyLoyverse

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const scan = async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch('/api/loyverse/compare-databases');
      const d = await res.json();
      if (d.success) setData(d);
      else showToast(d.error, 'error');
    } catch { showToast('Error de conexión', 'error'); }
    setLoading(false);
  };

  const fixOne = async (action, item) => {
    setFixing(item.phone10);
    try {
      const body = action === 'sync-name'
        ? { action, key: item.key, newName: item.loyverseName }
        : { action, key: item.key };
      const res = await fetch('/api/loyverse/compare-databases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const d = await res.json();
      if (d.success) {
        showToast(action === 'sync-name' ? 'Nombre sincronizado ✅' : 'Key eliminada ✅');
        setData(prev => ({
          ...prev,
          nameMismatch: prev.nameMismatch.filter(x => x.phone10 !== item.phone10),
          onlyRedis: prev.onlyRedis.filter(x => x.phone10 !== item.phone10),
          stats: {
            ...prev.stats,
            nameMismatch: action === 'sync-name' ? prev.stats.nameMismatch - 1 : prev.stats.nameMismatch,
            onlyRedis: action === 'clean-redis' ? prev.stats.onlyRedis - 1 : prev.stats.onlyRedis,
            synced: action === 'sync-name' ? prev.stats.synced + 1 : prev.stats.synced
          }
        }));
      } else showToast(d.error, 'error');
    } catch { showToast('Error de conexión', 'error'); }
    setFixing(null);
  };

  const syncAll = async () => {
    if (!confirm('¿Actualizar TODOS los nombres en Redis para que coincidan con Loyverse?')) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/loyverse/compare-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncAll: true })
      });
      const d = await res.json();
      if (d.success) {
        showToast(`${d.fixed} nombres sincronizados ✅`);
        await scan();
      } else showToast(d.error, 'error');
    } catch { showToast('Error de conexión', 'error'); }
    setSyncing(false);
  };

  const sectionItems = data
    ? section === 'mismatch' ? data.nameMismatch
      : section === 'onlyRedis' ? data.onlyRedis
      : data.onlyLoyverse
    : [];

  return (
    <>
      <Toast toast={toast} />
      <p style={{ color: 'var(--text-secondary)', marginBottom: 28, fontSize: 15 }}>
        Cruza los clientes de Loyverse con los registros <code>client_name_*</code> de Redis para detectar inconsistencias.
      </p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
        <button onClick={scan} disabled={loading} style={btnStyle('#00a884')}>
          {loading ? 'Comparando...' : '🔎 Comparar bases'}
        </button>
        {data?.stats?.nameMismatch > 0 && (
          <button onClick={syncAll} disabled={syncing} style={btnStyle('#6366f1')}>
            {syncing ? 'Sincronizando...' : `⚡ Sincronizar todos los nombres (${data.stats.nameMismatch})`}
          </button>
        )}
      </div>

      {data && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <StatBox label="En Loyverse" value={data.stats.loyverseTotal} />
            <StatBox label="En Redis" value={data.stats.redisTotal} />
            <StatBox label="Sincronizados" value={data.stats.synced} color="#00a884" />
            <StatBox label="Nombre diferente" value={data.stats.nameMismatch} color={data.stats.nameMismatch > 0 ? '#f59e0b' : '#00a884'} />
            <StatBox label="Solo en Redis" value={data.stats.onlyRedis} color={data.stats.onlyRedis > 0 ? '#ef4444' : '#00a884'} />
            <StatBox label="Solo en Loyverse" value={data.stats.onlyLoyverse} color="var(--text-secondary)" />
          </div>

          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-color)', paddingBottom: 0 }}>
            {[
              { key: 'mismatch', label: `Nombre diferente (${data.stats.nameMismatch})` },
              { key: 'onlyRedis', label: `Solo en Redis (${data.stats.onlyRedis})` },
              { key: 'onlyLoyverse', label: `Solo en Loyverse (${data.stats.onlyLoyverse})` }
            ].map(t => (
              <button key={t.key} onClick={() => setSection(t.key)} style={{
                border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontWeight: 600, fontSize: 13, padding: '8px 16px', borderRadius: '8px 8px 0 0',
                color: section === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderBottom: section === t.key ? '2px solid var(--text-primary)' : '2px solid transparent'
              }}>{t.label}</button>
            ))}
          </div>

          {sectionItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)', fontSize: 15 }}>
              ✅ Sin registros en esta categoría
            </div>
          )}

          {sectionItems.map(item => (
            <div key={item.phone10} style={{
              background: 'var(--bg-secondary)', borderRadius: 12, padding: '14px 18px',
              marginBottom: 10, border: '1px solid var(--border-color)',
              display: 'flex', alignItems: 'center', gap: 16
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>📱 {item.phone10}</div>
                {section === 'mismatch' && (
                  <div style={{ fontSize: 13, marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>LOYVERSE </span>
                      <strong style={{ color: '#00a884' }}>{item.loyverseName}</strong>
                    </span>
                    <span style={{ color: 'var(--text-secondary)' }}>→</span>
                    <span>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>REDIS </span>
                      <strong style={{ color: '#f59e0b' }}>{item.redisName}</strong>
                    </span>
                    {item.points > 0 && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{item.points} pts</span>}
                  </div>
                )}
                {section === 'onlyRedis' && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                    Nombre en Redis: <strong>{item.name || '(vacío)'}</strong>
                  </div>
                )}
                {section === 'onlyLoyverse' && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 3 }}>
                    {item.name} · {item.points} pts
                  </div>
                )}
              </div>

              {section === 'mismatch' && (
                <button
                  onClick={() => fixOne('sync-name', item)}
                  disabled={fixing === item.phone10}
                  style={btnStyle('#6366f1', true)}
                >
                  {fixing === item.phone10 ? '...' : 'Usar nombre Loyverse'}
                </button>
              )}
              {section === 'onlyRedis' && (
                <button
                  onClick={() => fixOne('clean-redis', item)}
                  disabled={fixing === item.phone10}
                  style={btnStyle('#ef4444', true)}
                >
                  {fixing === item.phone10 ? '...' : 'Limpiar Redis'}
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════
// Página principal con pestañas
// ═══════════════════════════════════════════════
export default function DuplicadosPage() {
  const [tab, setTab] = useState('duplicados');

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', color: 'var(--text-primary)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>🔍 Gestión de Clientes</h1>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '1px solid var(--border-color)' }}>
        {[
          { key: 'duplicados', label: '📋 Duplicados Loyverse' },
          { key: 'comparar',   label: '⚖️ Comparar BD' }
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: '10px 10px 0 0',
            color: tab === t.key ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderBottom: tab === t.key ? '3px solid var(--text-primary)' : '3px solid transparent',
            transition: 'color 0.15s'
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'duplicados' && <TabDuplicados />}
      {tab === 'comparar'   && <TabComparar />}
    </div>
  );
}
