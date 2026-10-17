/**
 * Tiny external store shared by the 3D scene (R3F) and the DOM UI.
 * Kept outside React so per-frame updates (scroll progress) never re-render the tree.
 */
const listeners = new Set();

export const store = {
  progress: 0,        // 0..1 scroll progress across the experience
  hovered: null,      // part id under the pointer
  selected: null,     // part id focused by click
  assembled: false,   // true once the assembly has completed (enables rotate, shows back-to-top)
  heroDone: false,    // true once the timed hero intro has played out
  heroStarted: false, // begins only after the loading screen exits
  heroStrokeStarted: false, // hero headline begins on the final camera keyframe
  heroTransition: 0,  // 0..1 scroll-linked hero-to-studio handoff (read by the Three.js frame loop)
  heroTransitionActive: false, // mount the Flux Lines scrim only while the handoff is in progress
  act: 'hero',        // 'hero' while the intro/interactive hero shows, 'site' for the cabin assembly
  set(patch) {
    Object.assign(this, patch);
    listeners.forEach((fn) => fn());
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot() {
    return this;
  },
};
