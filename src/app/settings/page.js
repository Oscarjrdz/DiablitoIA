"use client";
import React, { useState, useEffect } from 'react';

export default function SettingsPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [config, setConfig] = useState({
    wappInstance: '',
    wappToken: '',
    aiToken: '',
    botEnabled: false
  });

  useEffect(() => {
    // Load existing Loyverse token
    const savedToken = localStorage.getItem('loyverse_api_token');
    if (savedToken) {
      setTimeout(() => setToken(savedToken), 0);
    }

    // Load Bot Config
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.config) {
          setConfig({
            wappInstance: data.config.wappInstance || '',
            wappToken: data.config.wappToken || '',
            aiToken: data.config.aiToken || '',
            botEnabled: data.config.botEnabled === undefined ? true : data.config.botEnabled
          });
        }
      });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!token.trim()) {
      setMessage('Please enter a valid token.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setMessage('Verifying token...');

    try {
      const res = await fetch('/api/loyverse/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() })
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('loyverse_api_token', token.trim());
        
        // Save Bot Config
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...config, loyverseToken: token.trim() })
        });

        setStatus('success');
        setMessage('Settings verified and saved successfully!');
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to verify token.');
      }
    } catch (err) {
      setStatus('error');
      setMessage('An error occurred while verifying the token.');
    }
  };

  const handleRegisterWebhook = async () => {
    if (!token) return alert('Por favor, ingresa y guarda tu Token de Loyverse primero.');
    const sure = confirm('¿Deseas asentar automáticamente el Webhook en tu Loyverse para detectar clientes nuevos?');
    if (!sure) return;
    setStatus('loading');
    setMessage('Registrando Webhook secreto en Loyverse...');
    try {
      const res = await fetch('/api/loyverse/webhooks/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
           action: 'customers.update',
           url: 'https://global-sales-prediction.vercel.app/api/loyverse/webhook'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage('¡Webhook enlazado maravillosamente! Loyverse ya nos va a notificar clientes nuevos.');
      } else {
        setStatus('error');
        setMessage('Error en webhook (¿Quizá ya estaba ligado?): ' + (data.error || 'Network error'));
      }
    } catch (err) {
      setStatus('error');
      setMessage('Un error ha ocurrido de conexión.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px' }}>
      <h1 className="page-title">Settings</h1>
      <p className="page-subtitle">Configure your global dashboard settings.</p>

      <div className="card">
        <h3>API Configuration</h3>
        <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
          Enter your Loyverse Access Token to connect the dashboard to your stores.
        </p>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label" htmlFor="loyverse-token">Loyverse Access Token</label>
            <input 
              id="loyverse-token"
              type="password" 
              className="form-input" 
              placeholder="e.g. a708c43b39fc499da2cef3e65e44c25d"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <h3 style={{ marginTop: '2rem', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>WhatsApp Bot Config (GatewayWapp)</h3>
          
          <div className="form-group">
            <label className="form-label" htmlFor="wapp-instance">WAPP Instance ID</label>
            <input 
              id="wapp-instance"
              type="text" 
              className="form-input" 
              placeholder="e.g. 9056d7014d"
              value={config.wappInstance}
              onChange={(e) => setConfig({...config, wappInstance: e.target.value})}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="wapp-token">WAPP Token</label>
            <input 
              id="wapp-token"
              type="password" 
              className="form-input" 
              placeholder="e.g. 494801642408..."
              value={config.wappToken}
              onChange={(e) => setConfig({...config, wappToken: e.target.value})}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', marginTop: '1rem', border: '1px solid #e2e8f0' }}>
            <label className="form-label" style={{ marginBottom: 0 }}>🌟 Estado del Asistente (Bot ON/OFF):</label>
            <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '60px', height: '34px' }}>
              <input 
                type="checkbox" 
                checked={config.botEnabled} 
                onChange={(e) => setConfig({...config, botEnabled: e.target.checked})} 
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span className="slider round" style={{
                position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: config.botEnabled ? '#22c55e' : '#ccc', transition: '.4s', borderRadius: '34px'
              }}>
                <span style={{
                  position: 'absolute', content: '""', height: '26px', width: '26px', left: config.botEnabled ? '26px' : '4px', bottom: '4px',
                  backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                }} />
              </span>
            </label>
            <span style={{ fontWeight: 600, color: config.botEnabled ? '#15803d' : '#94a3b8' }}>{config.botEnabled ? 'ENCENDIDO' : 'APAGADO'}</span>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label className="form-label" htmlFor="ai-token">Token Antigravity / OpenAI</label>
            <input 
              id="ai-token"
              type="password" 
              className="form-input" 
              placeholder="YOUR_API_KEY"
              value={config.aiToken}
              onChange={(e) => setConfig({...config, aiToken: e.target.value})}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'Verifying...' : 'Save Configuration'}
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleRegisterWebhook}
              style={{ backgroundColor: '#8b5cf6', borderColor: '#8b5cf6', color: 'white' }}
              disabled={status === 'loading' || !token}
            >
              🚀 Auto-Ligar Webhook
            </button>
          </div>
        </form>

        {message && (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            borderRadius: '8px',
            backgroundColor: status === 'error' ? '#FEF2F2' : status === 'success' ? '#ECFDF5' : '#F3F4F6',
            color: status === 'error' ? '#991B1B' : status === 'success' ? '#065F46' : '#1F2937',
            border: `1px solid ${status === 'error' ? '#F87171' : status === 'success' ? '#34D399' : '#D1D5DB'}`
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
