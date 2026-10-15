import * as THREE from 'three';
import { HERO_LIFT_MOTION } from './liftMotion.js';

export const HERO_LIFT_DISPLAY_SCALE = 0.65;

const isSourceGreen = (material) => {
  const color = material?.color;
  return Boolean(color && color.g > 0.78 && color.r < 0.18 && color.b < 0.18);
};

/** Clone, remove the shaft enclosure, and place the elevator assembly on the plaza. */
export function createLiftRig(sourceScene, paletteYellow) {
  const sourceAssembly = sourceScene.getObjectByName('00_Full_Assembly_CHB') || sourceScene;
  const rig = sourceAssembly.clone(true);
  const shaftWall = rig.getObjectByName('Wall_CHB-1');
  if (!shaftWall?.parent) throw new Error('Chb.glb: shaft enclosure Wall_CHB-1 was not found');
  shaftWall.parent.remove(shaftWall);

  const movingCar = rig.getObjectByName('01_Carsling_CHB');
  if (!movingCar) throw new Error('Chb.glb: moving assembly 01_Carsling_CHB was not found');
  const movingYoke = rig.getObjectByName('01_Yok_CHB');
  if (!movingYoke) throw new Error('Chb.glb: upper moving yoke 01_Yok_CHB was not found');

  // The upper yoke is exported at the shaft head, separate from the car. Re-seat it on the
  // car's upper cross-beam, then parent it to the complete carsling so both pieces travel together.
  rig.updateMatrixWorld(true, true);
  const carRestBounds = new THREE.Box3().setFromObject(movingCar);
  const motionCarFrameCenterLocal = movingCar.worldToLocal(carRestBounds.getCenter(new THREE.Vector3())).toArray();
  const yokeSourceBounds = new THREE.Box3().setFromObject(movingYoke);
  const yokeOriginalTopY = yokeSourceBounds.max.y;
  const yokeAttachOffsetY = carRestBounds.max.y - yokeSourceBounds.min.y;
  movingCar.attach(movingYoke);
  movingCar.updateWorldMatrix(true, false);
  const carLocalOrigin = movingCar.worldToLocal(new THREE.Vector3(0, 0, 0));
  const yokeAttachOffsetLocal = movingCar.worldToLocal(new THREE.Vector3(0, yokeAttachOffsetY, 0)).sub(carLocalOrigin);
  movingYoke.position.add(yokeAttachOffsetLocal);
  movingCar.updateWorldMatrix(true, true);

  const materialCopies = new Map();
  let recoloredMaterials = 0;
  let recoloredMeshObjects = 0;
  rig.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const originals = Array.isArray(object.material) ? object.material : [object.material];
    if (originals.some(isSourceGreen)) recoloredMeshObjects += 1;

    const cloneMaterial = (material) => {
      if (!materialCopies.has(material)) {
        const copy = material.clone();
        if (isSourceGreen(copy)) {
          copy.color.set(paletteYellow);
          recoloredMaterials += 1;
        }
        materialCopies.set(material, copy);
      }
      return materialCopies.get(material);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });

  // Keep the complete open frame legible within the established Hero camera composition.
  // Measure from a neutral root so any authored root translation cannot offset the plaza alignment.
  rig.position.set(0, 0, 0);
  rig.scale.setScalar(HERO_LIFT_DISPLAY_SCALE);
  rig.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(rig);
  if (bounds.isEmpty()) throw new Error('Chb.glb: elevator assembly contains no renderable bounds');

  // The GLB's overall bounding-box centre is not its floor footprint: the support column and
  // base shoe sit toward the back of the frame. Anchor that real ground-contact element to the
  // centre of the plaza rings so the lift reads centred in both the overhead and final views.
  const plazaAnchor = rig.getObjectByName('Goldani_Down-1') || rig.getObjectByName('Profil_9x9-1');
  if (!plazaAnchor) throw new Error('Chb.glb: elevator base footprint anchor was not found');
  const anchorBounds = new THREE.Box3().setFromObject(plazaAnchor);
  const anchorCenter = anchorBounds.getCenter(new THREE.Vector3());

  rig.position.set(
    -anchorCenter.x,
    HERO_LIFT_MOTION.surfaceY - bounds.min.y,
    -anchorCenter.z,
  );
  rig.updateWorldMatrix(true, true);
  const placedBounds = new THREE.Box3().setFromObject(rig);
  const motionEnvelopeBounds = placedBounds.clone();
  const yokeTopTravelLimitY = yokeOriginalTopY * rig.scale.y + rig.position.y;
  motionEnvelopeBounds.max.y = Math.max(motionEnvelopeBounds.max.y, yokeTopTravelLimitY);
  const placedAnchorBounds = new THREE.Box3().setFromObject(plazaAnchor);
  const placedAnchorCenter = placedAnchorBounds.getCenter(new THREE.Vector3());
  rig.visible = false;
  rig.userData.motionCar = movingCar;
  rig.userData.motionYoke = movingYoke;
  rig.userData.motionCarRestY = movingCar.position.y;
  rig.userData.motionCarFrameCenterLocal = motionCarFrameCenterLocal;
  rig.userData.motionLocalScale = rig.scale.y;
  rig.userData.motionName = movingCar.name;
  rig.userData.motionYokeName = movingYoke.name;
  rig.userData.motionYokeAttachOffsetY = yokeAttachOffsetY;
  rig.userData.motionYokeTopLimitY = yokeTopTravelLimitY;
  rig.userData.removedShaftWall = shaftWall.name;
  rig.userData.recoloredMaterials = recoloredMaterials;
  rig.userData.recoloredMeshObjects = recoloredMeshObjects;
  rig.userData.plazaAnchorName = plazaAnchor.name;
  rig.userData.plazaAnchorCenter = placedAnchorCenter.toArray();
  // Keep the base anchor at the ring origin when the full model yaws in the Hero intro.
  rig.userData.plazaOrbitOffset = [rig.position.x, rig.position.z];
  rig.userData.surfaceBounds = {
    min: motionEnvelopeBounds.min.toArray(),
    max: motionEnvelopeBounds.max.toArray(),
  };
  return rig;
}

/** Clone the Cabin Pro GLB into the lift car and align its centre to the car frame. */
export function attachHeroCabin(rig, sourceCabinScene) {
  const movingCar = rig?.userData.motionCar;
  if (!movingCar) throw new Error('Hero lift rig has no moving carsling for the cabin mount');
  if (!sourceCabinScene) throw new Error('Cabin Pro GLB scene is required for the Hero cabin mount');
  if (rig.userData.motionCabin) return rig.userData.motionCabin;

  sourceCabinScene.updateMatrixWorld(true, true);
  const cabin = sourceCabinScene.clone(true);
  cabin.name = 'Hero_Cabin_Pro_V6';
  const materialCopies = new Map();
  cabin.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const cloneMaterial = (material) => {
      if (!material) return material;
      if (!materialCopies.has(material)) {
        const copy = material.clone();
        const color = copy.color;
        if (color && color.g > 0.5 && color.r < 0.35 && color.b < 0.35) color.set('#ffc21a');
        materialCopies.set(material, copy);
      }
      return materialCopies.get(material);
    };
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
  });

  const cabinSourceBounds = new THREE.Box3().setFromObject(cabin);
  if (cabinSourceBounds.isEmpty()) throw new Error('Cabin Pro GLB contains no renderable bounds');

  // Add rather than Object3D.attach: attach preserves world scale and would cancel the Hero rig's
  // intentional 0.65 display scale. Align the cabin's source bounds centre to the carsling frame.
  const cabinSourceCenter = cabinSourceBounds.getCenter(new THREE.Vector3());
  const carFrameCenterLocal = new THREE.Vector3(...rig.userData.motionCarFrameCenterLocal);
  movingCar.add(cabin);
  cabin.position.add(carFrameCenterLocal.sub(cabinSourceCenter));
  rig.updateMatrixWorld(true, true);

  rig.userData.motionCabin = cabin;
  rig.userData.motionCabinName = cabin.name;
  rig.userData.motionCabinSourceBounds = {
    min: cabinSourceBounds.min.toArray(),
    max: cabinSourceBounds.max.toArray(),
  };
  return cabin;
}
