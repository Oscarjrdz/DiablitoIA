'use client';
import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ChatErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', flexDirection: 'column', gap: 16, color: '#8696a0'
        }}>
          <span style={{ fontSize: 52 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 15 }}>Algo salió mal en el chat.</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              color: '#007AFF', background: 'none', border: '1px solid #007AFF',
              borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14
            }}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
