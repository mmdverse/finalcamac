import * as THREE from 'three';

/** Named motion settings for the counterweighted lift: the car starts high and descends first. */
export const HERO_LIFT_MOTION = Object.freeze({
  cycleSeconds: 12,
  travelMeters: 2.4,
  topDwellSeconds: 1,
  descentSeconds: 5,
  bottomDwellSeconds: 1,
  ascentSeconds: 5,
  surfaceY: 0.03,
});

const smooth = (value) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/** Smooth travel magnitude in metres; the rig applies it down to the car and up to the weight. */
export function liftTravelAt(seconds) {
  const {
    cycleSeconds,
    travelMeters,
    topDwellSeconds,
    descentSeconds,
    bottomDwellSeconds,
    ascentSeconds,
  } = HERO_LIFT_MOTION;
  const phase = ((seconds % cycleSeconds) + cycleSeconds) % cycleSeconds;
  const descentEnd = topDwellSeconds + descentSeconds;
  const ascentStart = descentEnd + bottomDwellSeconds;
  const ascentEnd = ascentStart + ascentSeconds;

  if (phase < topDwellSeconds) return 0;
  if (phase < descentEnd) return travelMeters * smooth((phase - topDwellSeconds) / descentSeconds);
  if (phase < ascentStart) return travelMeters;
  if (phase < ascentEnd) return travelMeters * (1 - smooth((phase - ascentStart) / ascentSeconds));
  return 0;
}
