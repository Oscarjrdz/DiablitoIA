"use client";
import React, { useState, useEffect } from 'react';

export default function BotPage() {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    fetch('/api/bot')
      .then(r => r.json())
      .then(d => {
        if (d.success && d.prompt) setPrompt(d.prompt);
      });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setStatus('loading');
    
    try {
      const res = await fetch('/api/bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      if (res.ok) {
        setStatus('success');
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px' }}>
      <h1 className="page-title">Bot IA (Prompt)</h1>
      <p className="page-subtitle">Configura el comportamiento de tu Asistente Inteligente para WhatsApp.</p>

      <div className="card">
        <h3>System Prompt del Bot</h3>
        <p style={{ marginTop: '0.5rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
          Escribe las instrucciones que definen cómo quieres que el bot responda a los clientes por WhatsApp.
        </p>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <textarea 
              className="form-input" 
              style={{ minHeight: '300px', fontFamily: 'monospace', padding: '1rem', resize: 'vertical' }}
              placeholder="Ejemplo: Eres un asistente experto en ventas de Pizzas. Tu objetivo es..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Guardando...' : 'Guardar Prompt'}
          </button>
        </form>

        {status === 'success' && (
          <div style={{ marginTop: '1rem', color: '#065F46', background: '#ECFDF5', padding: '1rem', borderRadius: '8px' }}>
            ¡Prompt guardado con éxito!
          </div>
        )}
      </div>
    </div>
  );
}
