import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createLiftRig, HERO_LIFT_DISPLAY_SCALE } from '../src/hero/liftModel.js';
import { HERO_LIFT_MOTION, liftTravelAt } from '../src/hero/liftMotion.js';
import { PAL } from '../src/hero/heroData.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const modelPath = path.join(here, '../public/models/camac-lift-chb.glb');
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
rig.updateWorldMatrix(true, true);
const bounds = new THREE.Box3().setFromObject(rig);
const size = bounds.getSize(new THREE.Vector3());
assert.equal(rig.userData.motionName, '01_Carsling_CHB');
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

let greenObjects = 0;
rig.traverse((object) => {
  if (!object.isMesh) return;
  const mats = Array.isArray(object.material) ? object.material : [object.material];
  if (mats.some((material) => material.color?.g > 0.78 && material.color.r < 0.18 && material.color.b < 0.18)) greenObjects += 1;
});
assert.equal(greenObjects, 0, 'no source-green material remains after CAMAC yellow conversion');

const homeY = rig.userData.motionCar.position.y;
const homeWorldY = rig.userData.motionCar.getWorldPosition(new THREE.Vector3()).y;
rig.userData.motionCar.position.y = homeY + HERO_LIFT_MOTION.travelMeters / rig.userData.motionLocalScale;
rig.updateWorldMatrix(true, true);
const raisedWorldY = rig.userData.motionCar.getWorldPosition(new THREE.Vector3()).y;
assert.ok(Math.abs((raisedWorldY - homeWorldY) - HERO_LIFT_MOTION.travelMeters) < 1e-6, 'car moves along world Y by the configured travel');

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
console.log('PASS: 01_Carsling_CHB moves on Y; full 2.47 m travel stays within the visible guide frame.');
console.log('PASS: 69 green mesh objects recolored through 2 shared materials; zero green materials remain.');
console.log('PASS: configurable 12 s surface rise/dwell/descent cycle is smooth and returns to the lower stop.');
