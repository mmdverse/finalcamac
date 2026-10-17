import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  applyLiftTravel,
  attachHeroCabin,
  attachHeroMotor,
  createLiftRig,
  HERO_CABIN_FLOOR_CLEARANCE,
  HERO_GUIDE_RAIL_NAMES,
  HERO_GUIDE_RAIL_TOP_CLEARANCE_METERS,
  HERO_LIFT_DISPLAY_SCALE,
} from '../src/hero/liftModel.js';
import { HERO_LIFT_MOTION, liftTravelAt } from '../src/hero/liftMotion.js';
import { PAL } from '../src/hero/heroData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../public');
const scaffoldDesktopPath = path.join(publicDir, 'models/camac-assembly.desktop.glb');
const scaffoldMobilePath = path.join(publicDir, 'models/camac-assembly.mobile.glb');
const cabinDesktopPath = path.join(publicDir, 'models/cabin-pro-v6.desktop.glb');
const cabinMobilePath = path.join(publicDir, 'models/cabin-pro-v6.mobile.glb');
const heroMotorPath = path.join(publicDir, 'models/hero-motor.glb');

function readGlbJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const label = path.basename(filePath);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${label} is a GLB file`);
  assert.equal(view.getUint32(4, true), 2, `${label} uses GLB v2`);
  const jsonLength = view.getUint32(12, true);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON', `${label} starts with a JSON chunk`);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

/**
 * Build a lightweight bounds-only Three.js proxy from glTF accessor bounds. This lets the
 * validator exercise the real named hierarchy and runtime mounting code without decoding the
 * Draco payload or allocating millions of CAD vertices.
 */
function buildBoundsProxy(json) {
  const materialCache = new Map();
  const nodes = json.nodes.map((definition, nodeIndex) => {
    const object = new THREE.Group();
    const rawName = definition.name || `node-${nodeIndex}`;
    // Match GLTFLoader: spaces in node names become underscores in Object3D.name.
    object.name = THREE.PropertyBinding.sanitizeNodeName(rawName);
    if (definition.matrix) {
      object.matrix.fromArray(definition.matrix);
      object.matrixAutoUpdate = false;
    } else {
      object.position.fromArray(definition.translation || [0, 0, 0]);
      object.quaternion.fromArray(definition.rotation || [0, 0, 0, 1]);
      object.scale.fromArray(definition.scale || [1, 1, 1]);
    }

    if (definition.mesh !== undefined) {
      const meshDefinition = json.meshes[definition.mesh];
      meshDefinition.primitives.forEach((primitive, primitiveIndex) => {
        const accessor = json.accessors[primitive.attributes.POSITION];
        assert.ok(accessor?.min && accessor?.max, `${object.name} position accessor exposes bounds`);
        const min = new THREE.Vector3(...accessor.min);
        const max = new THREE.Vector3(...accessor.max);
        const size = max.clone().sub(min);
        const materialKey = primitive.material ?? -1;
        let material = materialCache.get(materialKey);
        if (!material) {
          const materialDefinition = json.materials?.[primitive.material] || {};
          const pbr = materialDefinition.pbrMetallicRoughness || {};
          const color = pbr.baseColorFactor || [1, 1, 1, 1];
          material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color[0], color[1], color[2]),
            metalness: pbr.metallicFactor ?? 0,
            roughness: pbr.roughnessFactor ?? 1,
          });
          materialCache.set(materialKey, material);
        }
        const geometry = new THREE.BoxGeometry(
          Math.max(size.x, 1e-7),
          Math.max(size.y, 1e-7),
          Math.max(size.z, 1e-7),
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${object.name}-bounds-${primitiveIndex}`;
        mesh.position.copy(min).add(max).multiplyScalar(0.5);
        object.add(mesh);
      });
    }
    return object;
  });

  json.nodes.forEach((definition, index) => {
    for (const childIndex of definition.children || []) nodes[index].add(nodes[childIndex]);
  });
  const scene = new THREE.Group();
  scene.name = 'glTF bounds proxy';
  for (const rootIndex of json.scenes[json.scene ?? 0].nodes) scene.add(nodes[rootIndex]);
  scene.updateMatrixWorld(true, true);
  return scene;
}

function sceneBounds(scene) {
  const bounds = new THREE.Box3().setFromObject(scene);
  assert.ok(!bounds.isEmpty(), 'scene exposes renderable bounds');
  return bounds;
}

function assertClose(actual, expected, tolerance, message) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≉ ${expected}`);
}

function assertContained(inner, outer, tolerance = 1e-4, label = 'bounds') {
  assert.ok(inner.min.x >= outer.min.x - tolerance, `${label}: min X stays inside`);
  assert.ok(inner.max.x <= outer.max.x + tolerance, `${label}: max X stays inside`);
  assert.ok(inner.min.y >= outer.min.y - tolerance, `${label}: min Y stays inside`);
  assert.ok(inner.max.y <= outer.max.y + tolerance, `${label}: max Y stays inside`);
  assert.ok(inner.min.z >= outer.min.z - tolerance, `${label}: min Z stays inside`);
  assert.ok(inner.max.z <= outer.max.z + tolerance, `${label}: max Z stays inside`);
}

const scaffoldDesktopJson = readGlbJson(scaffoldDesktopPath);
const scaffoldMobileJson = readGlbJson(scaffoldMobilePath);
const cabinDesktopJson = readGlbJson(cabinDesktopPath);
const cabinMobileJson = readGlbJson(cabinMobilePath);
const heroMotorJson = readGlbJson(heroMotorPath);

assert.ok(scaffoldDesktopJson.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'desktop scaffold uses local Draco compression');
assert.ok(scaffoldMobileJson.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'mobile scaffold uses local Draco compression');
assert.equal(scaffoldDesktopJson.animations?.length || 0, 0, 'runtime motion is expected; no baked clips are present');
assert.equal(scaffoldMobileJson.animations?.length || 0, 0, 'mobile tier has no baked clips');
assert.equal(scaffoldDesktopJson.nodes.filter((node) => node.name === '00 Strukture Down').length, 2, 'both authored lower-frame sections are preserved');
for (const name of ['00 Full Assembly', '00 Strukture Up', '0_Weight', '01_Weight Frame', '01_Weight System', 'مدل یوک بندی', ...['Rail T9-1', 'Rail T9-2']]) {
  assert.ok(scaffoldDesktopJson.nodes.some((node) => node.name === name), `named assembly part “${name}” is preserved`);
}
assert.equal(heroMotorJson.nodes.length, 1, 'hero motor GLB contains only the requested motor node');
assert.equal(heroMotorJson.nodes[0].name, 'BM300-2', 'hero motor is the inspected BM300-2 node');
assert.equal(heroMotorJson.meshes.length, 1, 'hero motor GLB contains no fixture or table meshes');
assert.equal(heroMotorJson.meshes[0].primitives.length, 7, 'all seven BM300-2 material primitives are preserved');
assert.ok(heroMotorJson.extensionsRequired?.includes('KHR_draco_mesh_compression'), 'hero motor uses local Draco compression');
assert.equal(heroMotorJson.animations?.length || 0, 0, 'hero motor has no unnecessary animation clips');

const scaffoldDesktopScene = buildBoundsProxy(scaffoldDesktopJson);
const scaffoldMobileScene = buildBoundsProxy(scaffoldMobileJson);
const cabinDesktopScene = buildBoundsProxy(cabinDesktopJson);
const cabinMobileScene = buildBoundsProxy(cabinMobileJson);
const heroMotorScene = buildBoundsProxy(heroMotorJson);
const scaffoldDesktopBounds = sceneBounds(scaffoldDesktopScene);
const scaffoldMobileBounds = sceneBounds(scaffoldMobileScene);
const cabinDesktopBounds = sceneBounds(cabinDesktopScene);
const cabinMobileBounds = sceneBounds(cabinMobileScene);

for (const axis of ['x', 'y', 'z']) {
  assertClose(scaffoldDesktopBounds.min[axis], scaffoldMobileBounds.min[axis], 0.003, `mobile scaffold min ${axis} matches desktop`);
  assertClose(scaffoldDesktopBounds.max[axis], scaffoldMobileBounds.max[axis], 0.003, `mobile scaffold max ${axis} matches desktop`);
  assertClose(cabinDesktopBounds.min[axis], cabinMobileBounds.min[axis], 1e-6, `mobile Cabin Pro min ${axis} matches desktop`);
  assertClose(cabinDesktopBounds.max[axis], cabinMobileBounds.max[axis], 1e-6, `mobile Cabin Pro max ${axis} matches desktop`);
}
const scaffoldSize = scaffoldDesktopBounds.getSize(new THREE.Vector3());
assertClose(scaffoldSize.x, 1.987, 0.01, 'scaffold width remains in authored metre scale');
assertClose(scaffoldSize.y, 7.915, 0.01, 'scaffold height remains in authored metre scale');
assertClose(scaffoldSize.z, 1.714, 0.01, 'scaffold depth remains in authored metre scale');
const cabinSize = cabinDesktopBounds.getSize(new THREE.Vector3());
assertClose(cabinSize.x, 1.42, 0.005, 'Cabin Pro width remains in authored metre scale');
assertClose(cabinSize.y, 4.031, 0.005, 'Cabin Pro height remains in authored metre scale');
assertClose(cabinSize.z, 1.372, 0.005, 'Cabin Pro depth remains in authored metre scale');

const rig = createLiftRig(scaffoldDesktopScene, PAL.yellow);
const cabin = attachHeroCabin(rig, cabinDesktopScene);
const heroMotor = attachHeroMotor(rig, heroMotorScene);
rig.updateMatrixWorld(true, true);
const car = rig.userData.motionCar;
const yoke = rig.userData.motionYoke;
const counterweight = rig.userData.motionCounterweight;
const fixedFrameBounds = new THREE.Box3(
  new THREE.Vector3(...rig.userData.fixedFrameBounds.min),
  new THREE.Vector3(...rig.userData.fixedFrameBounds.max),
);
const expectedGuideRailTopY = fixedFrameBounds.max.y - HERO_GUIDE_RAIL_TOP_CLEARANCE_METERS * HERO_LIFT_DISPLAY_SCALE;
for (const name of HERO_GUIDE_RAIL_NAMES) {
  const guideRail = rig.getObjectByName(name);
  assert.ok(guideRail, `authored guide rail “${name}” is present`);
  const guideRailBounds = new THREE.Box3().setFromObject(guideRail);
  assertClose(guideRailBounds.min.y, fixedFrameBounds.min.y, 0.003, `${name} keeps its authored bottom endpoint`);
  assertClose(guideRailBounds.max.y, expectedGuideRailTopY, 0.003, `${name} reaches the annotated upper stop`);
}
const motionEnvelopeBounds = new THREE.Box3(
  new THREE.Vector3(...rig.userData.surfaceBounds.min),
  new THREE.Vector3(...rig.userData.surfaceBounds.max),
);
const cabinRestBounds = new THREE.Box3().setFromObject(cabin);
const heroMotorRestBounds = new THREE.Box3().setFromObject(heroMotor);
const motorSupportBounds = new THREE.Box3(
  new THREE.Vector3(...rig.userData.heroMotorSupportBounds.min),
  new THREE.Vector3(...rig.userData.heroMotorSupportBounds.max),
);
const yokeRestBounds = new THREE.Box3().setFromObject(yoke);
const counterweightRestBounds = new THREE.Box3().setFromObject(counterweight);

assert.equal(rig.userData.motionName, 'Hero_Moving_Car');
assert.equal(yoke.name, 'مدل_یوک_بندی');
assert.equal(yoke.parent, car, 'authored yoke stays on the moving-car pivot');
assert.equal(cabin.parent, car, 'Cabin Pro is mounted on the moving-car pivot');
assert.equal(heroMotor.name, 'Hero_BM300-2');
assert.equal(heroMotor.parent, rig, 'BM300-2 is fixed to the scaffold, not the moving cabin car');
assertClose(heroMotorRestBounds.min.y, motorSupportBounds.max.y, 1e-5, 'BM300-2 lower face is seated on the CAD motor-support surface');
assertClose(rig.userData.heroMotorMountSurfaceY, motorSupportBounds.max.y, 1e-9, 'motor mount uses the named upper support rails');
assert.ok(heroMotorRestBounds.min.x >= fixedFrameBounds.min.x - 0.02, 'motor stays within the scaffold width');
assert.ok(heroMotorRestBounds.max.x <= fixedFrameBounds.max.x + 0.02, 'motor stays within the scaffold width');
assert.ok(heroMotorRestBounds.min.z >= fixedFrameBounds.min.z - 0.02, 'motor stays within the scaffold depth');
assert.ok(heroMotorRestBounds.max.z <= fixedFrameBounds.max.z + 0.02, 'motor stays within the scaffold depth');
assert.equal(counterweight.name, 'Hero_Moving_Counterweight');
assert.equal(counterweight.children[0].name, '0_Weight', 'both counterweight subassemblies travel together');
assert.ok(rig.userData.cabinFitsFrame, 'the cabin bounds fit inside the fixed scaffold at the high stop');
assertContained(cabinRestBounds, fixedFrameBounds, 0.002, 'high-stop cabin');
assertContained(cabinRestBounds, motionEnvelopeBounds, 0.002, 'high-stop cabin motion envelope');
assertClose(rig.scale.y, HERO_LIFT_DISPLAY_SCALE, 1e-9, 'display scale');
assertClose(fixedFrameBounds.min.y, HERO_LIFT_MOTION.surfaceY, 0.003, 'fixed scaffold rests on the plaza surface');
assertClose(cabinRestBounds.min.y - yokeRestBounds.min.y, HERO_CABIN_FLOOR_CLEARANCE * HERO_LIFT_DISPLAY_SCALE, 0.003, 'cabin floor is seated just above the lower yoke');

const homeCabinBounds = cabinRestBounds.clone();
const homeWeightBounds = counterweightRestBounds.clone();
const homeCarY = car.position.y;
const homeWeightY = counterweight.position.y;
applyLiftTravel(rig, HERO_LIFT_MOTION.travelMeters);
rig.updateMatrixWorld(true, true);
const lowerCabinBounds = new THREE.Box3().setFromObject(cabin);
const lowerYokeBounds = new THREE.Box3().setFromObject(yoke);
const raisedWeightBounds = new THREE.Box3().setFromObject(counterweight);
const motorAfterTravelBounds = new THREE.Box3().setFromObject(heroMotor);
assertClose(lowerCabinBounds.min.y - homeCabinBounds.min.y, -HERO_LIFT_MOTION.travelMeters, 1e-5, 'car travels down by the configured world distance');
assertClose(motorAfterTravelBounds.min.y, heroMotorRestBounds.min.y, 1e-9, 'fixed BM300-2 does not travel with the car');
assertClose(motorAfterTravelBounds.max.y, heroMotorRestBounds.max.y, 1e-9, 'fixed BM300-2 stays on the scaffold');
assertClose(raisedWeightBounds.min.y - homeWeightBounds.min.y, HERO_LIFT_MOTION.travelMeters, 1e-5, 'counterweight travels up by the same world distance');
assert.ok(lowerCabinBounds.min.y >= HERO_LIFT_MOTION.surfaceY, 'cabin clears the plaza at the lower stop');
assert.ok(lowerYokeBounds.min.y >= HERO_LIFT_MOTION.surfaceY - 0.005, 'moving yoke clears the plaza at the lower stop');
assert.ok(raisedWeightBounds.max.y <= fixedFrameBounds.max.y + 0.005, 'counterweight remains inside the guide-frame height');
assertContained(lowerCabinBounds, motionEnvelopeBounds, 0.002, 'lower-stop cabin');
assertContained(lowerYokeBounds, motionEnvelopeBounds, 0.002, 'lower-stop yoke');
assertContained(raisedWeightBounds, motionEnvelopeBounds, 0.002, 'raised counterweight');
applyLiftTravel(rig, 0);
assert.equal(car.position.y, homeCarY, 'zero travel restores the car pivot');
assert.equal(counterweight.position.y, homeWeightY, 'zero travel restores the counterweight pivot');
applyLiftTravel(rig, HERO_LIFT_MOTION.travelMeters * 2);
assertClose(car.position.y, homeCarY - HERO_LIFT_MOTION.travelMeters / HERO_LIFT_DISPLAY_SCALE, 1e-9, 'travel is clamped to the configured stroke');
applyLiftTravel(rig, 0);

const approx = (actual, expected) => assertClose(actual, expected, 1e-9, 'liftTravelAt');
approx(liftTravelAt(0), 0);
approx(liftTravelAt(1), 0);
approx(liftTravelAt(3.5), HERO_LIFT_MOTION.travelMeters / 2);
approx(liftTravelAt(6), HERO_LIFT_MOTION.travelMeters);
approx(liftTravelAt(7), HERO_LIFT_MOTION.travelMeters);
approx(liftTravelAt(9.5), HERO_LIFT_MOTION.travelMeters / 2);
approx(liftTravelAt(12), 0);

console.log('PASS: desktop/mobile scaffold GLBs retain the full named CAD hierarchy and matching 1.987 × 7.915 × 1.714 m bounds.');
console.log('PASS: Cabin Pro desktop/mobile bounds match at 1.42 × 4.031 × 1.372 m and fit on the T9 rail axis.');
console.log(`PASS: all ${HERO_GUIDE_RAIL_NAMES.length} T9/T5 guide rails are extended to the marked upper stop without moving their bases.`);
console.log(`PASS: ${rig.userData.recoloredMaterials} shared source-green scaffold material(s) are recolored CAMAC yellow; fixed scaffold rests on the plaza.`);
console.log('PASS: extracted Draco BM300-2 only (1 node, 1 mesh, 7 primitives) is seated on the named upper motor supports and stays fixed.');
console.log('PASS: cabin and authored yoke descend together 2.4 m while the counterweight rises 2.4 m, with both stops inside the frame.');
console.log('PASS: the bounded 12 s down/dwell/up cycle is smooth and resets both moving pivots.');
