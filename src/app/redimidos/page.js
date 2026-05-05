'use client';
import React, { useState, useEffect } from 'react';
import styles from '../clients/page.module.css'; // Reutilizando los estilos de clientes para mantener coherencia
import Link from 'next/link';

export default function RedimidosPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('loyverse_api_token');
      if (!token) return;

      const res = await fetch('/api/loyverse/redemptions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
      }
    } catch (error) {
      console.error('Error fetching redemptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Cupones Redimidos <span style={{fontSize: '1.1rem', fontWeight: 400, color: '#94a3b8', marginLeft: '8px'}}>({logs.length})</span></h1>
        <div style={{display: 'flex', gap: '10px'}}>
           <Link href="/promociones">
              <button className={styles.createBtn} style={{background: '#64748b'}}>Regresar a Promociones</button>
           </Link>
           <button className={styles.createBtn} onClick={fetchLogs}>Refrescar</button>
        </div>
      </header>

      {loading ? (
        <p>Cargando historial de canjes...</p>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Cliente</th>
                <th>Teléfono Origen</th>
                <th>Folio</th>
                <th>Promoción</th>
                <th>Sucursal</th>
                <th>Atendido Por</th>
                <th>Ticket / Recibo</th>
                <th>Monto Ticket</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((log) => {
                const dateObj = new Date(log.receiptDate);
                const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString();

                return (
                  <tr key={log.id}>
                    <td className={styles.nowrap}>{dateStr}</td>
                    <td className={styles.nowrap}>{log.customerName}</td>
                    <td>{log.ownerPhone}</td>
                    <td><span className={styles.badge} style={{background: '#f97316'}}>{log.folio}</span></td>
                    <td className={styles.maxWidthCol}>{log.itemName}</td>
                    <td><span className={styles.badge} style={{background: '#10b981'}}>{log.storeName}</span></td>
                    <td>{log.cashierName}</td>
                    <td>{log.receiptNumber}</td>
                    <td style={{fontWeight: 'bold', color: '#ffffff'}}>${Number(log.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
              {logs.length === 0 && (
                <tr>
                  <td colSpan="9" style={{textAlign: 'center', padding: '1rem', color: '#64748b'}}>
                    Aún no hay cupones redimidos registrados en el sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && Math.ceil(logs.length / PAGE_SIZE) > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', padding: '1rem 0', marginTop: '0.5rem' }}>
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: currentPage === 1 ? '#334155' : '#0ea5e9', color: '#fff', fontWeight: 700, cursor: currentPage === 1 ? 'default' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1 }}
          >
            ← Anterior
          </button>
          <span style={{ color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600 }}>
            Página {currentPage} de {Math.ceil(logs.length / PAGE_SIZE)}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(Math.ceil(logs.length / PAGE_SIZE), p + 1))}
            disabled={currentPage === Math.ceil(logs.length / PAGE_SIZE)}
            style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: currentPage === Math.ceil(logs.length / PAGE_SIZE) ? '#334155' : '#0ea5e9', color: '#fff', fontWeight: 700, cursor: currentPage === Math.ceil(logs.length / PAGE_SIZE) ? 'default' : 'pointer', opacity: currentPage === Math.ceil(logs.length / PAGE_SIZE) ? 0.4 : 1 }}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
