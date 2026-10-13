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
  const placedAnchorBounds = new THREE.Box3().setFromObject(plazaAnchor);
  const placedAnchorCenter = placedAnchorBounds.getCenter(new THREE.Vector3());
  rig.visible = false;
  rig.userData.motionCar = movingCar;
  rig.userData.motionCarRestY = movingCar.position.y;
  rig.userData.motionLocalScale = rig.scale.y;
  rig.userData.motionName = movingCar.name;
  rig.userData.removedShaftWall = shaftWall.name;
  rig.userData.recoloredMaterials = recoloredMaterials;
  rig.userData.recoloredMeshObjects = recoloredMeshObjects;
  rig.userData.plazaAnchorName = plazaAnchor.name;
  rig.userData.plazaAnchorCenter = placedAnchorCenter.toArray();
  // Keep the base anchor at the ring origin when the full model yaws in the Hero intro.
  rig.userData.plazaOrbitOffset = [rig.position.x, rig.position.z];
  rig.userData.surfaceBounds = {
    min: placedBounds.min.toArray(),
    max: placedBounds.max.toArray(),
  };
  return rig;
}
