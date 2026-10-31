import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { store } from './lib/store';
import './styles.css';

// Always start the cinematic sequence from the very top, even after a reload mid-scroll.
if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
const resetScroll = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
resetScroll();
window.addEventListener('pageshow', () => {
  resetScroll();
  requestAnimationFrame(resetScroll);
}, { once: true });
store.act = 'hero';
store.heroStarted = false;
store.heroDone = false;
store.heroStrokeStarted = false;
store.heroTransition = 0;
store.heroTransitionActive = false;

class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null, componentStack: '' };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[CAMAC] App render/startup failed:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    const message = this.state.error
      ? `${this.state.error.name || 'Error'}: ${this.state.error.message || 'No error message'}`
      : 'Unknown runtime error';

    return (
      <main
        dir="rtl"
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeContent: 'center',
          gap: '16px',
          padding: '24px',
          background: '#151719',
          color: '#f1eee6',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        <p style={{ margin: 0, fontSize: '18px' }}>بارگذاری صفحه کامل نشد.</p>
        <p style={{ margin: 0, color: '#c6c2b8' }}>خطای اجرایی در مرورگر رخ داده است.</p>
        <pre
          style={{
            maxWidth: 'min(760px, 90vw)',
            margin: 0,
            padding: '12px',
            border: '1px solid #484c4e',
            borderRadius: '6px',
            color: '#ffd86b',
            font: '12px/1.6 ui-monospace, monospace',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            textAlign: 'left',
            direction: 'ltr',
          }}
        >
          {message}
        </pre>
        {this.state.componentStack && (
          <details style={{ maxWidth: 'min(760px, 90vw)', textAlign: 'left', direction: 'ltr' }}>
            <summary>React component stack</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '11px' }}>
              {this.state.componentStack}
            </pre>
          </details>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            justifySelf: 'center',
            border: '1px solid #f2b632',
            borderRadius: '8px',
            padding: '10px 20px',
            background: '#f2b632',
            color: '#151719',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          بارگذاری دوباره
        </button>
      </main>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </AppErrorBoundary>,
);
