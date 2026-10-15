import assert from 'node:assert/strict';
import { createServer } from 'vite';

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { createLaserSign } = await vite.ssrLoadModule('/src/lib/laser.js');
  const sign = createLaserSign({
    fx: { emit() {} },
    toWorld: (point) => point,
    panel: { cx: 0, cy: 0, zFace: 0, width: 1, height: 2 },
    windowStart: 0,
    windowEnd: 1,
  });
  const firstC = sign.group.getObjectByName('CAMAC_letter_1_C');
  const finalC = sign.group.getObjectByName('CAMAC_letter_5_C');
  assert.ok(firstC?.isMesh && finalC?.isMesh, 'the vertical CAMAC sign contains first and final C meshes');
  assert.equal(firstC.userData.mirroredHorizontally, false, 'the first C keeps its original orientation');
  assert.equal(finalC.userData.mirroredHorizontally, true, 'only the final C is reversed');

  const firstPositions = firstC.geometry.attributes.position.array;
  const finalPositions = finalC.geometry.attributes.position.array;
  assert.equal(finalPositions.length, firstPositions.length, 'the mirrored glyph keeps the original mesh topology');
  const firstBounds = firstC.geometry.boundingBox;
  const finalBounds = finalC.geometry.boundingBox;
  const height = firstBounds.max.y - firstBounds.min.y;
  for (let index = 0; index < firstPositions.length; index += 3) {
    assert.ok(Math.abs(finalPositions[index] + firstPositions[index]) < 1e-6, 'the final C is horizontally mirrored');
    assert.ok(Math.abs(finalPositions[index + 1] + firstPositions[index + 1] + height) < 1e-6, 'the C mirror stays in its vertical slot');
    assert.ok(Math.abs(finalPositions[index + 2] - firstPositions[index + 2]) < 1e-6, 'the C front face remains directed toward the viewer');
  }
  assert.ok(Math.abs(finalBounds.min.x - firstBounds.min.x) < 1e-6);
  assert.ok(Math.abs(finalBounds.max.x - firstBounds.max.x) < 1e-6);
  assert.ok(Math.abs(finalBounds.min.y - firstBounds.min.y) < 1e-6);
  assert.ok(Math.abs(finalBounds.max.y - firstBounds.max.y) < 1e-6);
  console.log('PASS: only the final C in the vertical CAMAC sign is horizontally reversed; its face orientation and letter slot are preserved.');
} finally {
  await vite.close();
}
