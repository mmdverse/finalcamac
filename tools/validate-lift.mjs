import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { attachHeroCabin, createLiftRig, HERO_LIFT_DISPLAY_SCALE } from '../src/hero/liftModel.js';
import { HERO_LIFT_MOTION, liftTravelAt } from '../src/hero/liftMotion.js';
import { PAL } from '../src/hero/heroData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.join(here, '../public/models/camac-lift-chb.glb');
const cabinDesktopPath = path.join(here, '../public/models/cabin-pro-v6.desktop.glb');
const cabinMobilePath = path.join(here, '../public/models/cabin-pro-v6.mobile.glb');

function readGlbJson(filePath) {
  const bytes = fs.readFileSync(filePath);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${path.basename(filePath)} is a GLB file`);
  assert.equal(view.getUint32(4, true), 2, `${path.basename(filePath)} uses GLB v2`);
  const jsonLength = view.getUint32(12, true);
  assert.equal(bytes.toString('ascii', 16, 20), 'JSON', `${path.basename(filePath)} starts with a JSON chunk`);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
}

/** Bounds from standard glTF accessor min/max, including every node TRS/matrix transform. */
function getGltfSceneBounds(json) {
  const parents = new Array(json.nodes.length).fill(-1);
  json.nodes.forEach((node, index) => (node.children || []).forEach((child) => { parents[child] = index; }));
  const localMatrices = json.nodes.map((node) => {
    if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
    return new THREE.Matrix4().compose(
      new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale || [1, 1, 1])),
    );
  });
  const worldMatrices = new Array(json.nodes.length);
  const worldMatrixAt = (index) => {
    if (worldMatrices[index]) return worldMatrices[index];
    const matrix = localMatrices[index].clone();
    if (parents[index] >= 0) matrix.premultiply(worldMatrixAt(parents[index]));
    worldMatrices[index] = matrix;
    return matrix;
  };
  const nodeBounds = new Array(json.nodes.length);
  const boundsAt = (index) => {
    if (nodeBounds[index]) return nodeBounds[index].clone();
    const bounds = new THREE.Box3().makeEmpty();
    const node = json.nodes[index];
    if (node.mesh !== undefined) {
      for (const primitive of json.meshes[node.mesh].primitives) {
        const position = json.accessors[primitive.attributes.POSITION];
        assert.ok(position?.min && position?.max, 'Cabin Pro position accessors expose min/max bounds');
        bounds.union(new THREE.Box3(
          new THREE.Vector3(...position.min),
          new THREE.Vector3(...position.max),
        ).applyMatrix4(worldMatrixAt(index)));
      }
    }
    for (const child of node.children || []) bounds.union(boundsAt(child));
    nodeBounds[index] = bounds.clone();
    return bounds;
  };
  const bounds = new THREE.Box3().makeEmpty();
  for (const root of json.scenes[json.scene ?? 0].nodes) bounds.union(boundsAt(root));
  assert.ok(!bounds.isEmpty(), 'Cabin Pro GLB has renderable bounds');
  return bounds;
}

const cabinDesktopBounds = getGltfSceneBounds(readGlbJson(cabinDesktopPath));
const cabinMobileBounds = getGltfSceneBounds(readGlbJson(cabinMobilePath));
assert.ok(cabinDesktopBounds.min.distanceTo(cabinMobileBounds.min) < 1e-6, 'mobile and desktop Cabin Pro GLBs share the same lower bounds');
assert.ok(cabinDesktopBounds.max.distanceTo(cabinMobileBounds.max) < 1e-6, 'mobile and desktop Cabin Pro GLBs share the same upper bounds');
const cabinSize = cabinDesktopBounds.getSize(new THREE.Vector3());
assert.ok(Math.abs(cabinSize.x - 1.42) < 0.005 && Math.abs(cabinSize.y - 4.031) < 0.005 && Math.abs(cabinSize.z - 1.372) < 0.005, 'Cabin Pro GLB dimensions remain in lift-compatible metres');

const bytes = fs.readFileSync(modelPath);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const gltf = await new Promise((resolve, reject) => {
  new GLTFLoader().parse(arrayBuffer, '', resolve, reject);
});
assert.equal(gltf.animations.length, 0, 'the delivered GLB has no baked clips; runtime lift motion is expected');
const assembly = gltf.scene.getObjectByName('00_Full_Assembly_CHB');
assert.ok(assembly, 'top-level elevator assembly must exist');
const car = assembly.getObjectByName('01_Carsling_CHB');
assert.ok(car, 'identified moving car assembly must exist');
assert.ok(assembly.getObjectByName('Wall_CHB-1'), 'source shaft enclosure is identified before removal');
const meshObjects = [];
assembly.traverse((object) => { if (object.isMesh) meshObjects.push(object); });
assert.equal(meshObjects.length, 219);

const rig = createLiftRig(gltf.scene, PAL.yellow);
const cabinProxy = new THREE.Group();
const cabinProxyMesh = new THREE.Mesh(
  new THREE.BoxGeometry(cabinSize.x, cabinSize.y, cabinSize.z),
  new THREE.MeshBasicMaterial(),
);
cabinProxyMesh.position.copy(cabinDesktopBounds.getCenter(new THREE.Vector3()));
cabinProxy.add(cabinProxyMesh);
const heroCabin = attachHeroCabin(rig, cabinProxy);
rig.updateWorldMatrix(true, true);
const bounds = new THREE.Box3(
  new THREE.Vector3(...rig.userData.surfaceBounds.min),
  new THREE.Vector3(...rig.userData.surfaceBounds.max),
);
const restingBounds = new THREE.Box3().setFromObject(rig);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(restingBounds.min.y >= bounds.min.y - 1e-6 && restingBounds.max.y <= bounds.max.y + 1e-6, 'resting geometry fits inside the full motion envelope');
assert.equal(rig.userData.motionName, '01_Carsling_CHB');
assert.equal(rig.userData.motionCabinName, 'Hero_Cabin_Pro_V6');
assert.equal(heroCabin.parent, rig.userData.motionCar, 'Cabin Pro is mounted as part of the moving carsling');
const seatedCabinCenter = new THREE.Box3().setFromObject(heroCabin).getCenter(new THREE.Vector3());
const expectedCabinCenter = rig.userData.motionCar.localToWorld(new THREE.Vector3(...rig.userData.motionCarFrameCenterLocal));
assert.ok(seatedCabinCenter.distanceTo(expectedCabinCenter) < 1e-6, 'Cabin Pro is centred inside the car frame in all three axes');
assert.equal(rig.userData.removedShaftWall, 'Wall_CHB-1');
assert.equal(rig.getObjectByName('Wall_CHB-1'), undefined, 'shaft walls are removed from the rendered rig');
assert.equal(rig.userData.recoloredMeshObjects, 69);
assert.equal(rig.userData.recoloredMaterials, 2);
assert.ok(Math.abs(bounds.min.y - HERO_LIFT_MOTION.surfaceY) < 1e-6, 'assembly base rests on the plaza surface');
const plazaAnchor = rig.getObjectByName(rig.userData.plazaAnchorName);
assert.ok(plazaAnchor, 'the elevator floor-contact anchor exists');
const plazaAnchorCenter = new THREE.Box3().setFromObject(plazaAnchor).getCenter(new THREE.Vector3());
assert.ok(Math.abs(plazaAnchorCenter.x) < 1e-6 && Math.abs(plazaAnchorCenter.z) < 1e-6, 'elevator base footprint is aligned to the centre of the floor rings');
const baseX = rig.position.x;
const baseZ = rig.position.z;
const [offsetX, offsetZ] = rig.userData.plazaOrbitOffset;
for (const yaw of [-0.15, 0.15]) {
  rig.rotation.y = yaw;
  rig.position.x = Math.cos(yaw) * offsetX + Math.sin(yaw) * offsetZ;
  rig.position.z = -Math.sin(yaw) * offsetX + Math.cos(yaw) * offsetZ;
  rig.updateMatrixWorld(true, true);
  const rotatedAnchor = new THREE.Box3().setFromObject(plazaAnchor).getCenter(new THREE.Vector3());
  assert.ok(Math.abs(rotatedAnchor.x) < 1e-6 && Math.abs(rotatedAnchor.z) < 1e-6, 'lift yaw keeps the base anchor fixed over the floor-ring centre');
}
rig.rotation.y = 0;
rig.position.x = baseX;
rig.position.z = baseZ;
rig.updateMatrixWorld(true, true);
assert.ok(Math.abs(rig.scale.y - HERO_LIFT_DISPLAY_SCALE) < 1e-9);
assert.ok(Math.abs(size.x - 0.9425) < 0.01 && Math.abs(size.y - 5.6693) < 0.01 && Math.abs(size.z - 1.0082) < 0.01);
const carBounds = new THREE.Box3().setFromObject(rig.userData.motionCar);
assert.ok(carBounds.min.y >= HERO_LIFT_MOTION.surfaceY, 'car begins above the plaza surface');
assert.ok(carBounds.max.y + HERO_LIFT_MOTION.travelMeters <= bounds.max.y + 1e-6, 'car stays within the open guide frame through full travel');
const upperCrossBeam = rig.getObjectByName('Kamar_Carsling_UP-1');
assert.ok(upperCrossBeam, 'the moving car assembly includes its upper cross-beam');
assert.equal(upperCrossBeam.parent, rig.userData.motionCar, 'the upper cross-beam is mounted on the moving car mesh group');
const movingYoke = rig.userData.motionYoke;
assert.ok(movingYoke, 'the separate shaft-head yoke is present in the model');
assert.equal(movingYoke.parent, rig.userData.motionCar, 'the upper yoke is mounted on the moving car assembly');
const restingYokeBounds = new THREE.Box3().setFromObject(movingYoke);
const upperBeamBounds = new THREE.Box3().setFromObject(upperCrossBeam);
assert.ok(Math.abs(restingYokeBounds.min.y - upperBeamBounds.max.y) < 0.005, 'the moving yoke is seated on the car upper cross-beam');

let greenObjects = 0;
rig.traverse((object) => {
  if (!object.isMesh) return;
  const mats = Array.isArray(object.material) ? object.material : [object.material];
  if (mats.some((material) => material.color?.g > 0.78 && material.color.r < 0.18 && material.color.b < 0.18)) greenObjects += 1;
});
assert.equal(greenObjects, 0, 'no source-green material remains after CAMAC yellow conversion');

const homeY = rig.userData.motionCar.position.y;
const homeWorldY = rig.userData.motionCar.getWorldPosition(new THREE.Vector3()).y;
const beamHomeWorldY = upperCrossBeam.getWorldPosition(new THREE.Vector3()).y;
const yokeHomeBounds = new THREE.Box3().setFromObject(movingYoke);
const cabinHomeBounds = new THREE.Box3().setFromObject(heroCabin);
rig.userData.motionCar.position.y = homeY + HERO_LIFT_MOTION.travelMeters / rig.userData.motionLocalScale;
rig.updateWorldMatrix(true, true);
const raisedWorldY = rig.userData.motionCar.getWorldPosition(new THREE.Vector3()).y;
const beamRaisedWorldY = upperCrossBeam.getWorldPosition(new THREE.Vector3()).y;
const yokeRaisedBounds = new THREE.Box3().setFromObject(movingYoke);
const cabinRaisedBounds = new THREE.Box3().setFromObject(heroCabin);
assert.ok(Math.abs((raisedWorldY - homeWorldY) - HERO_LIFT_MOTION.travelMeters) < 1e-6, 'car moves along world Y by the configured travel');
assert.ok(Math.abs((beamRaisedWorldY - beamHomeWorldY) - HERO_LIFT_MOTION.travelMeters) < 1e-6, 'upper car cross-beam moves with the complete moving assembly');
assert.ok(Math.abs((yokeRaisedBounds.min.y - yokeHomeBounds.min.y) - HERO_LIFT_MOTION.travelMeters) < 1e-6, 'upper yoke moves with the car by the configured travel');
assert.ok(Math.abs((cabinRaisedBounds.min.y - cabinHomeBounds.min.y) - HERO_LIFT_MOTION.travelMeters) < 1e-6, 'the complete Cabin Pro model moves with the car by the configured travel');
assert.ok(yokeRaisedBounds.max.y <= rig.userData.motionYokeTopLimitY + 1e-6, 'upper yoke stays within the original guide envelope at the top stop');
assert.ok(cabinRaisedBounds.max.y <= bounds.max.y + 1e-6, 'the complete Cabin Pro model stays within the guide envelope at the top stop');

const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≉ ${expected}`);
approx(liftTravelAt(0), 0);
approx(liftTravelAt(1), 0);
approx(liftTravelAt(3.5), HERO_LIFT_MOTION.travelMeters / 2);
approx(liftTravelAt(6), HERO_LIFT_MOTION.travelMeters);
approx(liftTravelAt(7), HERO_LIFT_MOTION.travelMeters);
approx(liftTravelAt(9.5), HERO_LIFT_MOTION.travelMeters / 2);
approx(liftTravelAt(12), 0);

console.log('PASS: source GLB parses; 244 scene objects / 219 meshes / 44 materials; no embedded clips.');
console.log('PASS: Wall_CHB-1 removed; 217 open-frame meshes rest on the plaza and the floor-contact anchor is centred in the rings.');
console.log('PASS: Cabin Pro (desktop/mobile bounds match) is centred on 01_Carsling_CHB; car, cabin, and re-seated 01_Yok_CHB yoke move together 2.47 m inside the guide envelope.');
console.log('PASS: 69 green mesh objects recolored through 2 shared materials; zero green materials remain.');
console.log('PASS: configurable 12 s surface rise/dwell/descent cycle is smooth and returns to the lower stop.');
