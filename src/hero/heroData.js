/**
 * CAMAC hero — data extracted from the two storyboard boards. The authored beat sheet
 * uses six seconds; playback now compresses it into a deliberate 4-second one-take.
 * The camera begins high above the plaza and glides down while the world ignites around it.
 */

export const HERO_STORYBOARD_SECONDS = 6;
export const HERO_SECONDS = 4;

// Scroll fraction at which the hero world hands off to the studio scene.
export const HERO_HANDOFF_AT = 0.55;

/** Camera keyframes (world metres; the elevator stands at the origin on ground y = 0).
 *  The take makes a straight vertical drop toward the surface-mounted lift, then turns
 *  toward the shrine so the final frame reads: lift right, dome left. */
export const HERO_CAMERA = [
  { progress: 0.0 / HERO_STORYBOARD_SECONDS, pos: [0, 26, 0.6], target: [0, 0, 0], fov: 55, linear: true }, // 90° top-down over the elevator
  { progress: 1.15 / HERO_STORYBOARD_SECONDS, pos: [0, 20.8, 0.6], target: [0, 0, 0], fov: 54, linear: true }, // steady vertical drop…
  { progress: 2.3 / HERO_STORYBOARD_SECONDS, pos: [0, 15.6, 0.6], target: [0, 0, 0], fov: 52, linear: true }, // …same vertical line…
  { progress: 3.45 / HERO_STORYBOARD_SECONDS, pos: [0, 10.4, 0.6], target: [0, 0, 0], fov: 50, linear: true }, // …no arc, no drift…
  { progress: 4.6 / HERO_STORYBOARD_SECONDS, pos: [0, 5.2, 0.6], target: [0, 0.3, 0], fov: 47 }, // reach the lift, then turn to the city
  { progress: 5.3 / HERO_STORYBOARD_SECONDS, pos: [0.8, 3.4, 6.6], target: [-1.8, 1.6, 0], fov: 43 },
  { progress: 1.0, pos: [1.6, 2.5, 11.6], target: [-3.2, 2.3, 0], fov: 40 }, // final frame at 4 s: lift right, dome left
];

/** Atmosphere stays on the six-second storyboard scale and maps to the shorter take. */
export const HERO_ATMO = [
  { t: 0.0, color: '#2e3134', near: 6, far: 70 },
  { t: 1.5, color: '#565b61', near: 10, far: 100 },
  { t: 3.0, color: '#8f8b84', near: 14, far: 150 },
  { t: 4.5, color: '#9a968f', near: 16, far: 150 },
  { t: 6.0, color: '#a5a29b', near: 18, far: 155 },
];

/** Palette sampled from the boards' colour bar. */
export const PAL = {
  yellow: '#f2b632',
  yellowHot: '#ffd27a',
  white: '#eef1f3',
  grey: '#8b9096',
  dark: '#17181a',
};
