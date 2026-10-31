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
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[CAMAC] App render/startup failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

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
        <p style={{ margin: 0, color: '#c6c2b8' }}>لطفاً اتصال را بررسی کنید و دوباره تلاش کنید.</p>
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
