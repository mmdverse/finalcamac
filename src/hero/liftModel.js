import * as THREE from 'three';
import { HERO_LIFT_MOTION } from './liftMotion.js';

export const HERO_LIFT_DISPLAY_SCALE = 0.65;
export const HERO_CABIN_FLOOR_CLEARANCE = 0.03;

// Three.js sanitizes whitespace in GLTF node names to underscores during parsing.
const ASSEMBLY_NAME = '00_Full_Assembly';
const YOKE_NAME = 'مدل_یوک_بندی';
const WEIGHT_NAME = '0_Weight';
const CAR_RAIL_NAMES = ['Rail_T9-1', 'Rail_T9-2'];
export const HERO_GUIDE_RAIL_NAMES = Object.freeze([
  ...CAR_RAIL_NAMES,
  'Rail_T5-1',
  'Rail_T5-2',
]);
// The red annotation ends about half a metre below the scaffold's top edge.
export const HERO_GUIDE_RAIL_TOP_CLEARANCE_METERS = 0.52;
const BOX_EPSILON = 1e-5;

const isSourceGreen = (material) => {
  const color = material?.color;
  return Boolean(color && color.g > 0.78 && color.r < 0.18 && color.b < 0.18);
};

function requireObject(root, name, description) {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Full Assembly GLB: ${description} “${name}” was not found`);
  return object;
}

function objectBounds(object, description, precise = false) {
  object.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(object, precise);
  if (bounds.isEmpty()) throw new Error(`Full Assembly GLB: ${description} has no renderable bounds`);
  return bounds;
}

function boundsWithout(root, excludedGroups) {
  const bounds = new THREE.Box3().makeEmpty();
  root.traverse((object) => {
    if (!object.isMesh) return;
    let ancestor = object;
    while (ancestor) {
      if (excludedGroups.has(ancestor)) return;
      ancestor = ancestor.parent;
    }
    bounds.expandByObject(object);
  });
  if (bounds.isEmpty()) throw new Error('Full Assembly GLB: fixed scaffold has no renderable bounds');
  return bounds;
}

function styleMaterials(root, yellow, { softenLargeSurfaceAo = false } = {}) {
  const copies = new Map();
  let recoloredMaterials = 0;
  let recoloredMeshes = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    if (sourceMaterials.some(isSourceGreen)) recoloredMeshes += 1;

    const cloneMaterial = (material) => {
      if (!material) return material;
      if (!copies.has(material)) {
        const copy = material.clone();
        // The CAD AO atlases become harsh speckle at phone scale on broad painted sheets.
        // Keep their geometry and color, but soften that baked texture in the cinematic clone.
        if (softenLargeSurfaceAo && copy.aoMap && /(?:panel|sheet|floor)/i.test(copy.name)) {
          copy.aoMapIntensity = 0.15;
        }
        if (isSourceGreen(copy)) {
          copy.color.set(yellow);
          recoloredMaterials += 1;
        }
        copies.set(material, copy);
      }
      return copies.get(material);
    };

    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });

  return { recoloredMaterials, recoloredMeshes };
}

function motionEnvelope(rig) {
  const car = rig.userData.motionCar;
  const counterweight = rig.userData.motionCounterweight;
  const carRestY = rig.userData.motionCarRestY;
  const counterweightRestY = rig.userData.motionCounterweightRestY;
  const localTravel = HERO_LIFT_MOTION.travelMeters / rig.userData.motionLocalScale;

  rig.updateMatrixWorld(true, true);
  const envelope = new THREE.Box3().setFromObject(rig);
  car.position.y = carRestY - localTravel;
  counterweight.position.y = counterweightRestY + localTravel;
  rig.updateMatrixWorld(true, true);
  envelope.union(new THREE.Box3().setFromObject(rig));

  car.position.y = carRestY;
  counterweight.position.y = counterweightRestY;
  rig.updateMatrixWorld(true, true);
  return envelope;
}

/** Extend all four authored guide rails to the red-marked stopping level. */
function extendGuideRails(rig, frameBounds) {
  const rigScale = rig.getWorldScale(new THREE.Vector3()).y;
  if (!(rigScale > 0)) throw new Error('Hero scaffold has an invalid scale for the guide-rail extension');
  const targetTopY = frameBounds.max.y - HERO_GUIDE_RAIL_TOP_CLEARANCE_METERS * rigScale;

  for (const name of HERO_GUIDE_RAIL_NAMES) {
    const rail = requireObject(rig, name, 'guide rail');
    const before = objectBounds(rail, `${name} guide rail`);
    const currentLength = before.max.y - before.min.y;
    const targetLength = targetTopY - before.min.y;
    if (!(targetLength > currentLength)) {
      throw new Error(`Hero scaffold: target extension for “${name}” does not reach above the authored rail`);
    }

    const railUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(rail.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    if (railUp.y < 0.999) {
      throw new Error(`Hero scaffold: “${name}” is not aligned with the vertical guide axis`);
    }

    const parent = rail.parent;
    if (!parent) throw new Error(`Hero scaffold: “${name}” has no parent transform`);
    const parentUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(parent.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const localYToWorldY = parent.getWorldScale(new THREE.Vector3()).y * parentUp.y;
    if (!(localYToWorldY > 0)) {
      throw new Error(`Hero scaffold: “${name}” cannot be extended upward in world space`);
    }

    rail.scale.y *= targetLength / currentLength;
    rig.updateMatrixWorld(true, true);
    const stretched = objectBounds(rail, `${name} extended guide rail`);
    // Preserve the authored bottom endpoint even if a future rail mesh has a nonzero local origin.
    rail.position.y += (before.min.y - stretched.min.y) / localYToWorldY;
    rig.updateMatrixWorld(true, true);

    const seated = objectBounds(rail, `${name} extended guide rail`);
    if (Math.abs(seated.min.y - before.min.y) > 1e-4 || Math.abs(seated.max.y - targetTopY) > 1e-4) {
      throw new Error(`Hero scaffold: “${name}” did not retain its base or reach the marked rail height`);
    }
  }

  return targetTopY;
}

/**
 * Clone the complete scaffold, keeping the CAD-authored fixed frame intact while
 * separating its named car yoke and counterweight for opposite Y-axis travel.
 */
export function createLiftRig(sourceScene, paletteYellow) {
  if (!sourceScene) throw new Error('Full Assembly GLB scene is required');
  const sourceAssembly = sourceScene.getObjectByName(ASSEMBLY_NAME);
  if (!sourceAssembly) throw new Error(`Full Assembly GLB: root “${ASSEMBLY_NAME}” was not found`);

  const rig = sourceAssembly.clone(true);
  const movingYoke = requireObject(rig, YOKE_NAME, 'moving car yoke');
  const sourceWeight = requireObject(rig, WEIGHT_NAME, 'counterweight');
  const rails = CAR_RAIL_NAMES.map((name) => requireObject(rig, name, 'car guide rail'));

  // The midpoint between the two T9 guide rails is the car axis, not the centre of the
  // asymmetric assembly's overall AABB (which includes the counterweight and machinery).
  const railCenters = rails.map((rail) => objectBounds(rail, 'T9 guide rail').getCenter(new THREE.Vector3()));
  const railAxis = new THREE.Vector3(
    (railCenters[0].x + railCenters[1].x) / 2,
    0,
    (railCenters[0].z + railCenters[1].z) / 2,
  );

  // Put both moving subassemblies under neutral pivots. attach() preserves each authored
  // transform, so the CAD layout stays intact and only the new parent pivots translate.
  const movingCar = new THREE.Group();
  movingCar.name = 'Hero_Moving_Car';
  const movingCounterweight = new THREE.Group();
  movingCounterweight.name = 'Hero_Moving_Counterweight';
  rig.add(movingCar, movingCounterweight);
  movingCar.attach(movingYoke);
  movingCounterweight.attach(sourceWeight);
  const yokeLocalBounds = objectBounds(movingYoke, 'moving car yoke');

  const materialStats = styleMaterials(rig, paletteYellow);
  const movingGroups = new Set([movingCar, movingCounterweight]);

  rig.position.set(0, 0, 0);
  rig.scale.setScalar(HERO_LIFT_DISPLAY_SCALE);
  rig.updateMatrixWorld(true, true);

  // Ground the fixed frame rather than a travelling part; the rail-axis midpoint becomes
  // the plaza origin so narrow-screen yaw keeps the lift centred above the floor rings.
  const fixedBoundsAtOrigin = boundsWithout(rig, movingGroups);
  const guideRailTopAtOrigin = extendGuideRails(rig, fixedBoundsAtOrigin);
  rig.updateMatrixWorld(true, true);
  rig.position.set(
    -railAxis.x * HERO_LIFT_DISPLAY_SCALE,
    HERO_LIFT_MOTION.surfaceY - fixedBoundsAtOrigin.min.y,
    -railAxis.z * HERO_LIFT_DISPLAY_SCALE,
  );
  rig.updateMatrixWorld(true, true);

  const fixedFrameBounds = boundsWithout(rig, movingGroups);
  const fullAssemblyBounds = new THREE.Box3().setFromObject(rig);
  const placedRailAxis = new THREE.Vector3(railAxis.x, 0, railAxis.z).multiplyScalar(HERO_LIFT_DISPLAY_SCALE);
  placedRailAxis.x += rig.position.x;
  placedRailAxis.z += rig.position.z;

  rig.visible = false;
  rig.userData.motionCar = movingCar;
  rig.userData.motionYoke = movingYoke;
  rig.userData.motionCounterweight = movingCounterweight;
  rig.userData.motionCarRestY = movingCar.position.y;
  rig.userData.motionCounterweightRestY = movingCounterweight.position.y;
  rig.userData.motionLocalScale = rig.scale.y;
  rig.userData.motionName = movingCar.name;
  rig.userData.motionYokeName = movingYoke.name;
  rig.userData.motionCounterweightName = sourceWeight.name;
  rig.userData.motionAxis = railAxis.toArray();
  rig.userData.motionYokeLocalBounds = {
    min: yokeLocalBounds.min.toArray(),
    max: yokeLocalBounds.max.toArray(),
  };
  rig.userData.plazaAnchorCenter = placedRailAxis.toArray();
  rig.userData.plazaOrbitOffset = [rig.position.x, rig.position.z];
  rig.userData.fixedFrameBounds = {
    min: fixedFrameBounds.min.toArray(),
    max: fixedFrameBounds.max.toArray(),
  };
  rig.userData.guideRailNames = [...HERO_GUIDE_RAIL_NAMES];
  rig.userData.guideRailTopY = guideRailTopAtOrigin + rig.position.y;
  rig.userData.fullAssemblyBounds = {
    min: fullAssemblyBounds.min.toArray(),
    max: fullAssemblyBounds.max.toArray(),
  };
  rig.userData.recoloredMaterials = materialStats.recoloredMaterials;
  rig.userData.recoloredMeshObjects = materialStats.recoloredMeshes;
  rig.userData.surfaceBounds = {
    min: fullAssemblyBounds.min.toArray(),
    max: fullAssemblyBounds.max.toArray(),
  };
  return rig;
}

/** Mount only the extracted BM300-2 motor on the scaffold's named upper support rails. */
export function attachHeroMotor(rig, sourceMotorScene) {
  if (!rig) throw new Error('Hero scaffold is required for the motor mount');
  if (!sourceMotorScene) throw new Error('BM300-2 GLB scene is required for the Hero motor mount');
  if (rig.userData.heroMotor) return rig.userData.heroMotor;

  const motorNode = sourceMotorScene.getObjectByName('BM300-2');
  if (!motorNode) throw new Error('BM300-2 GLB: the extracted motor node “BM300-2” was not found');

  // The scaffold's CAD-authored “4mm Motor …” rails define the fixed upper mount.
  // Use their actual top surface instead of a guessed world-space offset.
  const motorSupportBounds = new THREE.Box3().makeEmpty();
  rig.traverse((object) => {
    if (!object.name.startsWith('4mm_Motor')) return;
    motorSupportBounds.expandByObject(object, true);
  });
  if (motorSupportBounds.isEmpty()) {
    throw new Error('Hero scaffold: no CAD-authored “4mm Motor …” support parts were found');
  }

  const motor = sourceMotorScene.clone(true);
  motor.name = 'Hero_BM300-2';
  motor.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  rig.add(motor);
  rig.updateMatrixWorld(true, true);

  // This motor is rotated relative to its local axes. AABB-corner bounds invent a
  // bottom point that is not on the mesh, leaving a visible gap above the supports.
  const motorBeforeMount = objectBounds(motor, 'BM300-2 motor', true);
  const scale = rig.getWorldScale(new THREE.Vector3()).y;
  if (!(scale > 0)) throw new Error('Hero scaffold has an invalid scale for the BM300-2 mount');
  // The motor stays on the fixed scaffold (not the moving cabin car). Its authored X/Z
  // placement is preserved; only its lower face is seated on the support rails' top face.
  motor.position.y += (motorSupportBounds.max.y - motorBeforeMount.min.y) / scale;
  rig.updateMatrixWorld(true, true);

  const motorBounds = objectBounds(motor, 'mounted BM300-2 motor', true);
  if (Math.abs(motorBounds.min.y - motorSupportBounds.max.y) > 1e-4) {
    throw new Error('BM300-2 mount: the motor contact surface is not seated on the fixed support rails');
  }
  const priorSurfaceBounds = rig.userData.surfaceBounds;
  const surfaceBounds = priorSurfaceBounds
    ? new THREE.Box3(
      new THREE.Vector3(...priorSurfaceBounds.min),
      new THREE.Vector3(...priorSurfaceBounds.max),
    )
    : new THREE.Box3().makeEmpty();
  surfaceBounds.union(motorBounds);

  rig.userData.heroMotor = motor;
  rig.userData.heroMotorBounds = {
    min: motorBounds.min.toArray(),
    max: motorBounds.max.toArray(),
  };
  rig.userData.heroMotorSupportBounds = {
    min: motorSupportBounds.min.toArray(),
    max: motorSupportBounds.max.toArray(),
  };
  rig.userData.heroMotorMountSurfaceY = motorSupportBounds.max.y;
  rig.userData.surfaceBounds = {
    min: surfaceBounds.min.toArray(),
    max: surfaceBounds.max.toArray(),
  };
  return motor;
}

/** Mount an unscaled Cabin Pro clone inside the scaffold and on the car's lower yoke. */
export function attachHeroCabin(rig, sourceCabinScene) {
  const movingCar = rig?.userData.motionCar;
  if (!movingCar) throw new Error('Hero scaffold has no moving car pivot for the cabin mount');
  if (!sourceCabinScene) throw new Error('Cabin Pro GLB scene is required for the Hero cabin mount');
  if (rig.userData.motionCabin) return rig.userData.motionCabin;

  sourceCabinScene.updateMatrixWorld(true, true);
  const cabin = sourceCabinScene.clone(true);
  cabin.name = 'Hero_Cabin_Pro_V6';
  const materialStats = styleMaterials(cabin, '#ffc21a', { softenLargeSurfaceAo: true });
  const cabinSourceBounds = objectBounds(cabin, 'Cabin Pro model');
  const cabinSize = cabinSourceBounds.getSize(new THREE.Vector3());
  const yokeLowerY = rig.userData.motionYokeLocalBounds.min[1];
  const [axisX, , axisZ] = rig.userData.motionAxis;
  const targetCenter = new THREE.Vector3(
    axisX,
    yokeLowerY + HERO_CABIN_FLOOR_CLEARANCE + cabinSize.y / 2,
    axisZ,
  );
  const sourceCenter = cabinSourceBounds.getCenter(new THREE.Vector3());

  // Add (rather than attach) to preserve the real-world Cabin Pro dimensions under the
  // display-scaled scaffold. The lower face sits just above the yoke and the guide rails
  // define its X/Z alignment.
  movingCar.add(cabin);
  cabin.position.add(targetCenter.sub(sourceCenter));
  rig.updateMatrixWorld(true, true);

  const cabinRestBounds = new THREE.Box3().setFromObject(cabin);
  const fixedFrameBounds = new THREE.Box3(
    new THREE.Vector3(...rig.userData.fixedFrameBounds.min),
    new THREE.Vector3(...rig.userData.fixedFrameBounds.max),
  );
  const fitsFrame =
    cabinRestBounds.min.x >= fixedFrameBounds.min.x - BOX_EPSILON &&
    cabinRestBounds.max.x <= fixedFrameBounds.max.x + BOX_EPSILON &&
    cabinRestBounds.min.y >= fixedFrameBounds.min.y - BOX_EPSILON &&
    cabinRestBounds.max.y <= fixedFrameBounds.max.y + BOX_EPSILON &&
    cabinRestBounds.min.z >= fixedFrameBounds.min.z - BOX_EPSILON &&
    cabinRestBounds.max.z <= fixedFrameBounds.max.z + BOX_EPSILON;
  if (!fitsFrame) {
    movingCar.remove(cabin);
    throw new Error('Cabin Pro does not fit within the fixed scaffold bounds at the authored car position');
  }

  rig.userData.motionCabin = cabin;
  rig.userData.motionCabinName = cabin.name;
  rig.userData.motionCabinSourceBounds = {
    min: cabinSourceBounds.min.toArray(),
    max: cabinSourceBounds.max.toArray(),
  };
  rig.userData.motionCabinBounds = {
    min: cabinRestBounds.min.toArray(),
    max: cabinRestBounds.max.toArray(),
  };
  rig.userData.cabinFitsFrame = fitsFrame;
  rig.userData.cabinRecoloredMaterials = materialStats.recoloredMaterials;
  rig.userData.cabinRecoloredMeshObjects = materialStats.recoloredMeshes;
  const envelope = motionEnvelope(rig);
  rig.userData.surfaceBounds = {
    min: envelope.min.toArray(),
    max: envelope.max.toArray(),
  };
  return cabin;
}

/** Apply a bounded world-space travel amount: car down, counterweight up. */
export function applyLiftTravel(rig, travelMeters) {
  if (!rig?.userData?.motionCar || !rig?.userData?.motionCounterweight) return;
  const travel = THREE.MathUtils.clamp(travelMeters, 0, HERO_LIFT_MOTION.travelMeters);
  const localTravel = travel / rig.userData.motionLocalScale;
  rig.userData.motionCar.position.y = rig.userData.motionCarRestY - localTravel;
  rig.userData.motionCounterweight.position.y = rig.userData.motionCounterweightRestY + localTravel;
}
