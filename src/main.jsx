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

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
