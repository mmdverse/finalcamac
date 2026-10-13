import * as THREE from 'three';

/** Named, bounded motion settings for the open, surface-mounted elevator assembly. */
export const HERO_LIFT_MOTION = Object.freeze({
  cycleSeconds: 12,
  travelMeters: 2.47,
  bottomDwellSeconds: 1,
  ascentSeconds: 5,
  topDwellSeconds: 1,
  descentSeconds: 5,
  surfaceY: 0.03,
});

const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Smooth elevator displacement in metres from the GLB car's authored rest position. */
export function liftTravelAt(seconds) {
  const {
    cycleSeconds, travelMeters, bottomDwellSeconds, ascentSeconds,
    topDwellSeconds, descentSeconds,
  } = HERO_LIFT_MOTION;
  const phase = ((seconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
  const ascentEnd = bottomDwellSeconds + ascentSeconds;
  const descentStart = ascentEnd + topDwellSeconds;
  const descentEnd = descentStart + descentSeconds;
  if (phase < bottomDwellSeconds) return 0;
  if (phase < ascentEnd) return travelMeters * smooth((phase - bottomDwellSeconds) / ascentSeconds);
  if (phase < descentStart) return travelMeters;
  if (phase < descentEnd) return travelMeters * (1 - smooth((phase - descentStart) / descentSeconds));
  return 0;
}
