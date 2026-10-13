import { Suspense, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { store } from '../lib/store';
import { sampleCameraPath } from '../lib/cameraMath';
import { HERO_CAMERA, HERO_ATMO, HERO_SECONDS, PAL } from './heroData';
import { liftTravelAt } from './liftMotion';
import { createLiftRig } from './liftModel';

/**
 * The storyboard, rebuilt as a real 3D environment (not slides, not video).
 * Every asset below is a mesh/line/point in the scene; the narrative comes from
 * real changes of position, visibility and materials driven by `t` (0..9 s),
 * driven by a timed 9 s intro that plays on load (no scrolling).
 *
 * Beats (see heroData.js): fog+particles -> line network -> wireframe city ->
 * open plaza and surface-mounted elevator -> yellow rings -> close passes -> wide brand frame.
 * The shaft enclosure is removed; the elevator frame rests on the plaza and its named car
 * assembly moves vertically on the GLB's Y axis while the hero intro and idle frame play.
 */

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const rise = (t, a, b) => sstep((t - a) / (b - a));
const win = (t, a, b, c, d) => rise(t, a, b) * (1 - rise(t, c, d));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Soft radial dot texture (round particles, no square sprites). */
function softTexture(hard) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (hard) {
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,.6)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  } else {
    // gentler falloff for the big horizon glows
    grd.addColorStop(0, 'rgba(255,255,255,.9)');
    grd.addColorStop(0.5, 'rgba(255,255,255,.32)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function mergeBoxes(specs) {
  const pos = [];
  const nor = [];
  for (const [w, h, d, x, y, z] of specs) {
    let g = new THREE.BoxGeometry(w, h, d);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
    g = g.toNonIndexed();
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return geo;
}

const YELLOW = new THREE.Color(PAL.yellow);
const WHITE = new THREE.Color('#e6ebee');
const HERO_STROKE_START_AT = 4.6; // camera reaches the plaza-level keyframe and begins its turn

function buildHeroWorld() {
  const rnd = mulberry32(20261010);
  const group = new THREE.Group();
  const disposables = [];
  const reg = (o) => (disposables.push(o), o);
  const M = {}; // animated materials / objects

  /* ---------------- ground plaza ---------------- */
  M.groundMat = reg(
    new THREE.MeshStandardMaterial({ color: '#232527', roughness: 0.45, metalness: 0, envMapIntensity: 0.6 }),
  );
  const plazaShape = new THREE.Shape();
  plazaShape.absarc(0, 0, 95, 0, Math.PI * 2, false);
  const floorGeo = reg(new THREE.ShapeGeometry(plazaShape, 96).rotateX(-Math.PI / 2));
  const ground = new THREE.Mesh(floorGeo, M.groundMat);
  ground.receiveShadow = true;
  group.add(ground);

  /* thin technical grid on the floor (01-02), staying faint afterwards */
  const gridPos = [];
  for (let i = -44; i <= 44; i += 4) {
    gridPos.push(i, 0.02, -44, i, 0.02, 44, -44, 0.02, i, 44, 0.02, i);
  }
  const gridGeo = reg(new THREE.BufferGeometry());
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridPos, 3));
  M.gridMat = reg(
    new THREE.LineBasicMaterial({ color: '#cdd5d9', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(new THREE.LineSegments(gridGeo, M.gridMat));

  /* ---------------- initial particles (01) ---------------- */
  const dot = softTexture(true);
  reg(dot);
  const N_DOT = 260;
  const dPos = new Float32Array(N_DOT * 3);
  const dCol = new Float32Array(N_DOT * 3);
  for (let i = 0; i < N_DOT; i++) {
    const r = 3 + Math.sqrt(rnd()) * 32;
    const a = rnd() * Math.PI * 2;
    dPos.set([Math.cos(a) * r, 0.1 + rnd() * 2.6, Math.sin(a) * r], i * 3);
    const c = rnd() < 0.4 ? YELLOW : WHITE;
    const l = 0.7 + rnd() * 0.3;
    dCol.set([c.r * l, c.g * l, c.b * l], i * 3);
  }
  const dotGeo = reg(new THREE.BufferGeometry());
  dotGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dotGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
  M.dotMat = reg(
    new THREE.PointsMaterial({
      size: 0.22, map: dot, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, vertexColors: true, sizeAttenuation: true,
    }),
  );
  M.dots = new THREE.Points(dotGeo, M.dotMat);
  group.add(M.dots);

  /* ---------------- long network lines (01-02) ---------------- */
  const netPos = [];
  const netCol = [];
  const netLines = [];
  for (let i = 0; i < 30; i++) {
    const a = new THREE.Vector3((rnd() - 0.5) * 64, 0.12 + rnd() * 2.4, (rnd() - 0.5) * 64);
    const dir = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.06, rnd() - 0.5).normalize();
    const b = a.clone().addScaledVector(dir, 8 + rnd() * 24);
    netPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    netLines.push({ a, b });
    const c = rnd() < 0.45 ? YELLOW : WHITE;
    netCol.push(c.r, c.g, c.b, c.r, c.g, c.b);
  }
  const netGeo = reg(new THREE.BufferGeometry());
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(netPos, 3));
  netGeo.setAttribute('color', new THREE.Float32BufferAttribute(netCol, 3));
  M.netMat = reg(
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(new THREE.LineSegments(netGeo, M.netMat));

  /* living network: light pulses travelling along the lines */
  M.netLines = netLines;
  const N_PULSE = 26;
  M.pulseGeo = reg(new THREE.BufferGeometry());
  M.pulseGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PULSE * 3), 3));
  M.pulseMat = reg(
    new THREE.PointsMaterial({
      size: 0.28, map: dot, color: PAL.yellowHot, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  group.add(new THREE.Points(M.pulseGeo, M.pulseMat));
  M.pulseSeed = Array.from({ length: N_PULSE }, (_, i) => ({ li: i % netLines.length, sp: 0.22 + rnd() * 0.5, off: rnd() }));

  /* scan rings sweeping the plaza while the camera descends */
  M.scans = [0, 1].map(() => {
    const m = reg(
      new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    const mesh = new THREE.Mesh(reg(new THREE.RingGeometry(0.98, 1.0, 72).rotateX(-Math.PI / 2)), m);
    mesh.position.y = 0.025;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, m };
  });

  /* ---------------- wireframe city (02-03): varied towers, floor lines, roof accents ---------------- */
  const cityPos = [];
  const cityYellow = [];
  const cw = (x1, y1, z1, x2, y2, z2) => cityPos.push(x1, y1, z1, x2, y2, z2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.6;
    const r = 16 + rnd() * 18;
    const w = 3.5 + rnd() * 7;
    const h = 3 + rnd() * 8.5;
    const d = 3.5 + rnd() * 7;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) cw(x + sx, 0, z + sz, x + sx, h, z + sz);
    cw(x - w / 2, h, z - d / 2, x + w / 2, h, z - d / 2); cw(x - w / 2, h, z + d / 2, x + w / 2, h, z + d / 2);
    cw(x - w / 2, h, z - d / 2, x - w / 2, h, z + d / 2); cw(x + w / 2, h, z - d / 2, x + w / 2, h, z + d / 2);
    const floors = 2 + Math.floor(rnd() * 3);
    for (let f = 1; f <= floors; f++) {
      const y = (h * f) / (floors + 1);
      cw(x - w / 2, y, z - d / 2, x + w / 2, y, z - d / 2);
      cw(x - w / 2, y, z + d / 2, x + w / 2, y, z + d / 2);
    }
    if (rnd() < 0.55) cityYellow.push(x - w / 2, h, z - d / 2, x + w / 2, h, z - d / 2);
  }
  const cityWireGeo = reg(new THREE.BufferGeometry());
  cityWireGeo.setAttribute('position', new THREE.Float32BufferAttribute(cityPos, 3));
  M.cityWireMat = reg(
    new THREE.LineBasicMaterial({ color: '#dfe6ea', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(new THREE.LineSegments(cityWireGeo, M.cityWireMat));
  const cityYGeo = reg(new THREE.BufferGeometry());
  cityYGeo.setAttribute('position', new THREE.Float32BufferAttribute(cityYellow, 3));
  M.cityWireYMat = reg(
    new THREE.LineBasicMaterial({ color: PAL.yellow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  group.add(new THREE.LineSegments(cityYGeo, M.cityWireYMat));

  /* ---------------- Qom shrine (Hazrat-e Masoumeh) on the left horizon ---------------- */
  M.shrineMat = reg(
    new THREE.MeshStandardMaterial({ color: '#77726a', roughness: 1, metalness: 0, transparent: true, opacity: 0 }),
  );
  // only the dome glows — faintly, hazed by the real fog so it reads as far away; body/minarets stay shadowed
  M.shrineGoldMat = reg(
    new THREE.MeshStandardMaterial({
      color: '#8a6a1c', metalness: 0.4, roughness: 0.5,
      emissive: new THREE.Color('#5a3d0a'), emissiveIntensity: 0.4,
      transparent: true, opacity: 0,
    }),
  );
  const shrine = new THREE.Group();
  const court = new THREE.Mesh(reg(new THREE.BoxGeometry(16, 2.2, 10)), M.shrineMat);
  court.position.y = 1.1;
  const mainBlock = new THREE.Mesh(reg(new THREE.BoxGeometry(7.5, 5, 7.5)), M.shrineMat);
  mainBlock.position.y = 2.5;
  const drum = new THREE.Mesh(reg(new THREE.CylinderGeometry(3.2, 3.4, 3, 20)), M.shrineMat);
  drum.position.y = 6.5;
  shrine.add(court, mainBlock, drum);
  // onion dome: lathe profile, gold, glowing through the haze
  const domePts = [
    [0.0, 0], [2.6, 0.2], [3.0, 1.2], [2.7, 2.4], [1.8, 3.5], [0.9, 4.3], [0.25, 4.9], [0.0, 5.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const dome = new THREE.Mesh(reg(new THREE.LatheGeometry(domePts, 24)), M.shrineGoldMat);
  dome.position.y = 8.0;
  const spire = new THREE.Mesh(reg(new THREE.CylinderGeometry(0.05, 0.09, 1.6, 6)), M.shrineGoldMat);
  spire.position.y = 13.8;
  shrine.add(dome, spire);
  // lit window band around the drum
  const drumBand = new THREE.Mesh(reg(new THREE.CylinderGeometry(3.45, 3.45, 0.6, 20, 1, true)), M.shrineMat);
  drumBand.position.y = 6.6;
  shrine.add(drumBand);
  // two minarets with lit balconies and gold caps
  for (const sx of [-6.5, 6.5]) {
    const shaft = new THREE.Mesh(reg(new THREE.CylinderGeometry(0.42, 0.55, 12, 10)), M.shrineMat);
    shaft.position.set(sx, 6, 0);
    const band = new THREE.Mesh(reg(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 10, 1, true)), M.shrineMat);
    band.position.set(sx, 10.8, 0);
    const cap = new THREE.Mesh(reg(new THREE.ConeGeometry(0.55, 1.8, 10)), M.shrineMat);
    cap.position.set(sx, 12.7, 0);
    shrine.add(shaft, band, cap);
  }
  shrine.position.set(-46, 0, -71);
  group.add(shrine);

  /* ---------------- solid skyline silhouettes (06+): a real city horizon ---------------- */
  const skySpecs = [];
  const builtBoxes = [];
  const SHRINE_X = -46;
  const SHRINE_Z = -71;
  const pushBox = (w, h, d, x, z) => {
    if (Math.hypot(x - SHRINE_X, z - SHRINE_Z) < 12) return false; // keep the shrine silhouette clean
    skySpecs.push([w, h, d, x, h / 2 - 0.5, z]);
    builtBoxes.push({ w, h, d, x, z });
    return true;
  };
  const arc = (deg) => {
    const th = THREE.MathUtils.degToRad(deg);
    return [Math.sin(th), -Math.cos(th)];
  };
  for (let i = 0; i < 44; i++) {
    // low / mid blocks packed across the horizon arc the final camera sees
    const [sx, sz] = arc(-78 + (i / 44) * 136 + (rnd() - 0.5) * 6);
    const r = 60 + rnd() * 65;
    const low = rnd() < 0.6;
    pushBox(6 + rnd() * 9, low ? 3 + rnd() * 7 : 8 + rnd() * 8, 6 + rnd() * 9, sx * r, sz * r);
  }
  for (let i = 0; i < 12; i++) {
    // sparser backdrop blocks all around (for the top-down part of the take)
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.5;
    const r = 110 + rnd() * 35;
    pushBox(8 + rnd() * 10, 3 + rnd() * 8, 8 + rnd() * 10, Math.cos(a) * r, Math.sin(a) * r);
  }
  const towers = [];
  for (let i = 0; i < 10; i++) {
    // high-rises inside the same arc so the shrine sits among the city
    const [sx, sz] = arc(-70 + rnd() * 120);
    const r = 75 + rnd() * 55;
    const h = 14 + rnd() * 16;
    const w = 5 + rnd() * 6;
    const d = 5 + rnd() * 6;
    const x = sx * r;
    const z = sz * r;
    if (!pushBox(w, h, d, x, z)) continue; // no floating windows without their tower
    towers.push({ x, z, w, d, h });
  }
  M.skyMat = reg(
    new THREE.MeshStandardMaterial({ color: '#83807a', roughness: 1, metalness: 0, transparent: true, opacity: 0 }),
  );
  group.add(new THREE.Mesh(reg(mergeBoxes(skySpecs)), M.skyMat));

  /* dawn-lit windows, designed by distance: near = larger, warmer, denser;
     far = faint sparks dissolving into the fog. A few "awake floors" per building
     cluster the lights like real early-morning life; three light temperatures. */
  const winPos = [];
  const winCol = [];
  const WARM = new THREE.Color('#ffd9a0');
  const COOL = new THREE.Color('#dfe9f4');
  const AMBER = new THREE.Color('#ffc46a');
  const quadZ = (z, x, y, u, v, col, b) => {
    winPos.push(x - u, y - v, z, x + u, y - v, z, x + u, y + v, z, x - u, y - v, z, x + u, y + v, z, x - u, y + v, z);
    for (let i = 0; i < 6; i++) winCol.push(col.r * b, col.g * b, col.b * b);
  };
  const quadX = (x, z, y, u, v, col, b) => {
    winPos.push(x, y - v, z - u, x, y - v, z + u, x, y + v, z + u, x, y - v, z - u, x, y + v, z + u, x, y + v, z - u);
    for (let i = 0; i < 6; i++) winCol.push(col.r * b, col.g * b, col.b * b);
  };
  for (const bx of builtBoxes) {
    if (rnd() < 0.15) continue; // some buildings sleep in
    const fN = THREE.MathUtils.clamp(1 - (Math.hypot(bx.x, bx.z) - 55) / 85, 0, 1); // 1 near -> 0 far
    const u = 0.2 + 0.11 * fN;
    const rows = Math.max(3, Math.floor(bx.h / 1.7));
    const awake = new Set();
    const nAct = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < nAct; i++) awake.add(Math.floor(rnd() * rows));
    const faces = [
      { kind: 'z', off: -(bx.d / 2 + 0.06), span: bx.w },
      { kind: 'x', off: -(bx.w / 2 + 0.06), span: bx.d },
      { kind: 'x', off: bx.w / 2 + 0.06, span: bx.d },
    ];
    for (const f of faces) {
      const cols = Math.max(3, Math.floor(f.span / 1.35));
      for (let cx = 0; cx < cols; cx++) {
        for (let ry = 0; ry < rows; ry++) {
          let p = 0.14 + 0.12 * fN;
          if (awake.has(ry)) p *= 2.4;
          if (rnd() > Math.min(0.8, p)) continue;
          const hy = 1 + ((ry + 0.5) / rows) * (bx.h - 2);
          const hc = -f.span / 2 + ((cx + 0.5) / cols) * f.span;
          const cr = rnd();
          const col = cr < 0.7 ? WARM : cr < 0.92 ? COOL : AMBER;
          const b = (0.22 + 0.5 * fN) * (0.55 + rnd() * 0.45) * (col === AMBER ? 1.2 : col === COOL ? 0.75 : 1);
          if (f.kind === 'z') quadZ(bx.z + f.off, bx.x + hc, hy, u, u * 1.35, col, b);
          else quadX(bx.x + f.off, bx.z + hc, hy, u, u * 1.35, col, b);
        }
      }
    }
  }
  M.cityWinMat = reg(
    new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  const cityWinGeo = reg(new THREE.BufferGeometry());
  cityWinGeo.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
  cityWinGeo.setAttribute('color', new THREE.Float32BufferAttribute(winCol, 3));
  group.add(new THREE.Mesh(cityWinGeo, M.cityWinMat));

  // slow aviation beacons on the tallest towers — a quiet heartbeat on the skyline
  const beaconPos = [];
  for (const tw of towers) if (tw.h >= 18) beaconPos.push(tw.x, tw.h + 0.4, tw.z);
  M.beaconMat = reg(
    new THREE.PointsMaterial({
      size: 0.55, color: '#ff7a66', transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  const beaconGeo = reg(new THREE.BufferGeometry());
  beaconGeo.setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3));
  group.add(new THREE.Points(beaconGeo, M.beaconMat));

  /* ---------------- yellow plaza rings around the surface-mounted elevator (06+) ---------------- */
  M.ringMat = reg(
    new THREE.MeshBasicMaterial({ color: '#e9b53a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  const ring1 = new THREE.Mesh(reg(new THREE.RingGeometry(3.05, 3.22, 96).rotateX(-Math.PI / 2)), M.ringMat);
  ring1.position.y = 0.03;
  M.ring2Mat = M.ringMat.clone();
  reg(M.ring2Mat);
  const ring2 = new THREE.Mesh(reg(new THREE.RingGeometry(4.5, 4.56, 96).rotateX(-Math.PI / 2)), M.ring2Mat);
  ring2.position.y = 0.03;
  group.add(ring1, ring2);

  /* click ripple: a small interaction with the plaza after the intro */
  M.rippleMat = reg(
    new THREE.MeshBasicMaterial({ color: PAL.yellowHot, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  M.ripple = new THREE.Mesh(reg(new THREE.RingGeometry(0.96, 1.0, 72).rotateX(-Math.PI / 2)), M.rippleMat);
  M.ripple.position.y = 0.035;
  M.ripple.visible = false;
  group.add(M.ripple);

  /* ---------------- horizon glows ---------------- */
  const glowTex = softTexture(false);
  reg(glowTex);
  M.glowWhiteMat = reg(
    new THREE.SpriteMaterial({ map: glowTex, color: '#ffffff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  const glowWhite = new THREE.Sprite(M.glowWhiteMat);
  glowWhite.scale.set(46, 6, 1);
  glowWhite.position.set(0, 0.9, -95);
  group.add(glowWhite);
  M.glowWarmMat = reg(
    new THREE.SpriteMaterial({ map: glowTex, color: '#ff9e4a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  const glowWarm = new THREE.Sprite(M.glowWarmMat);
  glowWarm.scale.set(150, 16, 1);
  glowWarm.position.set(0, 4, -95);
  group.add(glowWarm);

  /* ---------------- hero lights ---------------- */
  M.hemi = new THREE.HemisphereLight('#cfd4da', '#33363a', 0.25);
  M.sun = new THREE.DirectionalLight('#ffd9a0', 0);
  M.sun.position.set(14, 13, -16); // sunrise rim from behind the skyline
  M.sun.castShadow = true;
  M.sun.shadow.mapSize.set(1024, 1024);
  Object.assign(M.sun.shadow.camera, { left: -16, right: 16, top: 18, bottom: -16, near: 2, far: 60 });
  M.sun.shadow.bias = -0.0004;
  M.sun.shadow.normalBias = 0.02;
  M.fill = new THREE.DirectionalLight('#e8ecef', 0);
  M.fill.position.set(-6, 8, 10);
  group.add(M.hemi, M.sun, M.fill);

  /* ---------------- per-frame update ---------------- */
  const groundA = new THREE.Color('#232527');
  const groundB = new THREE.Color('#66686b');

  function update(t, e) {
    M.gridMat.opacity =
      rise(t, -0.5, 0.4) * THREE.MathUtils.lerp(0.32, 0.15, rise(t, 3.2, 4.6)) * (0.8 + 0.2 * Math.sin(e * 2.4));
    M.dotMat.opacity = rise(t, -0.5, 0.25) * THREE.MathUtils.lerp(1, 0.55, rise(t, 2.2, 2.9));
    M.netMat.opacity = rise(t, 0.2, 0.8) * THREE.MathUtils.lerp(0.9, 0.45, rise(t, 2.1, 2.8));

    // living environment: drifting/twinkling dots, data pulses on the lines, scan sweeps
    M.dots.rotation.y = e * 0.03;
    M.dotMat.size = 0.22 * (1 + 0.18 * Math.sin(e * 2.1));
    const pWin = rise(t, 0.4, 1.0) * THREE.MathUtils.lerp(1, 0.8, rise(t, 4.2, 5.2));
    M.pulseMat.opacity = pWin * 0.9;
    if (pWin > 0.01) {
      const attr = M.pulseGeo.attributes.position;
      for (let i = 0; i < M.pulseSeed.length; i++) {
        const s = M.pulseSeed[i];
        const L = M.netLines[s.li];
        const f = (e * s.sp + s.off) % 1;
        attr.setXYZ(i, L.a.x + (L.b.x - L.a.x) * f, L.a.y + (L.b.y - L.a.y) * f, L.a.z + (L.b.z - L.a.z) * f);
      }
      attr.needsUpdate = true;
    }
    M.scans.forEach((sc, k) => {
      // storyboard sweeps during the descent, endless slow radar sweeps once live
      const q = t < 5.0 ? (t - 0.5 - k * 1.6) / 4.4 : (e * 0.1 + k * 0.5) % 1;
      if (q <= 0 || q >= 1) {
        sc.mesh.visible = false;
        sc.m.opacity = 0;
        return;
      }
      sc.mesh.visible = true;
      sc.mesh.scale.setScalar(2 + q * 34);
      sc.m.opacity = (1 - q) * 0.22;
    });
    M.cityWireMat.opacity = win(t, 1.1, 1.8, 2.9, 3.6) * 0.6;
    M.cityWireYMat.opacity = win(t, 1.3, 2.0, 2.9, 3.6) * 0.5;
    M.skyMat.opacity = rise(t, 3.0, 4.0);
    M.cityWinMat.opacity = rise(t, 3.4, 4.6) * (0.9 + 0.1 * Math.sin(e * 0.6));
    M.beaconMat.opacity = rise(t, 3.6, 4.8) * (0.35 + 0.3 * Math.sin(e * 1.4));
    M.shrineMat.opacity = rise(t, 3.0, 4.0);
    M.shrineGoldMat.opacity = rise(t, 3.0, 4.0);
    M.ringMat.opacity = rise(t, 3.6, 4.3) * 0.95;
    M.ring2Mat.opacity = rise(t, 3.7, 4.4) * 0.4;
    M.glowWhiteMat.opacity = win(t, 0, 0.35, 1.5, 2.2) * 0.55;
    M.glowWarmMat.opacity = rise(t, 1.5, 2.8) * 0.3;

    M.hemi.intensity = THREE.MathUtils.lerp(0.25, 0.6, rise(t, 1, 4));
    M.sun.intensity = 2.1 * rise(t, 1.5, 3.0);
    M.fill.intensity = 0.5 * rise(t, 3.2, 4.6);
    M.groundMat.color.copy(groundA).lerp(groundB, rise(t, 1.2, 4));
  }

  function dispose() {
    disposables.forEach((d) => d.dispose && d.dispose());
    [M.hemi, M.sun, M.fill].forEach((l) => l.dispose && l.dispose());
  }

  return { group, update, dispose, M };
}

/**
 * The source GLB has no embedded animation clips. Its named `01_Carsling_CHB`
 * assembly is the moving car; animate that complete group on the GLB's Y-up axis.
 * The 12 s surface-display cycle includes lower/upper dwells and a smooth 2.47 m rise/descent.
 */
function HeroLift({ rigRef }) {
  const { scene } = useGLTF('/models/camac-lift-chb.glb');
  const rig = useMemo(() => createLiftRig(scene, PAL.yellow), [scene]);
  return <primitive object={rig} ref={rigRef} />;
}

/** Atmosphere (background + fog) sampled over the 9 s timeline. */
const atmoColor = new THREE.Color();
const atmoNext = new THREE.Color();
function sampleAtmo(t, out) {
  let i = 0;
  while (i < HERO_ATMO.length - 2 && t > HERO_ATMO[i + 1].t) i++;
  const a = HERO_ATMO[i];
  const b = HERO_ATMO[Math.min(i + 1, HERO_ATMO.length - 1)];
  const k = sstep((t - a.t) / Math.max(1e-6, b.t - a.t));
  atmoColor.set(a.color);
  atmoNext.set(b.color);
  out.color.copy(atmoColor).lerp(atmoNext, k);
  out.near = THREE.MathUtils.lerp(a.near, b.near, k);
  out.far = THREE.MathUtils.lerp(a.far, b.far, k);
  return out;
}

const ORIGIN = new THREE.Vector3(0, 0, 0);
const UPV = new THREE.Vector3(0, 1, 0);

/**
 * The intro plays on load as a timed 9 s cinematic (no scrolling). When it ends the
 * hero frame stays alive: moving the pointer nudges the camera around the final
 * framing, and a click sends a ripple across the plaza the cabin answers to.
 * QA: `?freeze=<s>` or window.__FREEZE pins the timeline for screenshots.
 */
export default function HeroScene() {
  const { camera, scene, gl } = useThree();
  const world = useMemo(() => buildHeroWorld(), []);
  const liftRef = useRef(null);
  const tmp = useMemo(
    () => ({ cam: { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 }, atmo: { color: new THREE.Color(), near: 0, far: 0 }, rel: new THREE.Vector3() }),
    [],
  );
  const st = useMemo(() => ({ t: 0, az: 0, el: 0, rippleQ: false, rippleAt: -1, liftTime: 0, done: false, strokeStarted: false }), []);
  const freezeParam = useMemo(() => {
    const v = new URLSearchParams(window.location.search).get('freeze');
    return v == null ? null : Number(v);
  }, []);

  useEffect(() => () => world.dispose(), [world]);

  useEffect(() => {
    const down = () => {
      if (st.t >= HERO_SECONDS - 0.01) st.rippleQ = true;
    };
    gl.domElement.addEventListener('pointerdown', down);
    return () => gl.domElement.removeEventListener('pointerdown', down);
  }, [gl, st]);

  useFrame((state, dt) => {
    const hero = store.act === 'hero';
    if (world.group.visible !== hero) world.group.visible = hero;
    const liftRig = liftRef.current;
    if (liftRig && liftRig.visible !== hero) liftRig.visible = hero;
    if (!hero) return;

    const fr = window.__FREEZE != null ? window.__FREEZE : freezeParam;
    st.t = fr != null ? fr : Math.min(HERO_SECONDS, st.t + dt);
    st.liftTime = fr != null ? fr : st.liftTime + dt;
    const t = st.t;
    const e = state.clock.elapsedTime;
    if (!st.strokeStarted && t >= HERO_STROKE_START_AT) {
      st.strokeStarted = true;
      store.set({ heroStrokeStarted: true });
    }
    world.update(t, e);

    // camera along the storyboard path; after the intro the pointer can orbit it a little
    sampleCameraPath(HERO_CAMERA, Math.min(1, t / HERO_SECONDS), ORIGIN, 1, tmp.cam);
    // portrait / narrow screens: pull back and widen so the whole composition fits
    const aspect = state.size.width / Math.max(1, state.size.height);
    const narrow = Math.min(1, Math.max(0, (1.15 - aspect) / 0.6));
    if (narrow > 0.001) {
      tmp.cam.pos.sub(tmp.cam.target).multiplyScalar(1 + narrow * 0.55).add(tmp.cam.target);
      tmp.cam.fov *= 1 + narrow * 0.18;
    }
    // narrow screens: yaw the world so the shrine and surface-mounted lift stay in the slim frame
    const yawT = -narrow * 0.15;
    st.yaw = (st.yaw || 0) + (yawT - (st.yaw || 0)) * (1 - Math.exp(-dt * 3));
    world.group.rotation.y = st.yaw;
    if (liftRig) {
      // Rotate the offset root around the plaza origin, keeping its ground-contact anchor over the rings.
      const orbitOffset = liftRig.userData.plazaOrbitOffset;
      if (orbitOffset) {
        const c = Math.cos(st.yaw);
        const s = Math.sin(st.yaw);
        liftRig.position.x = c * orbitOffset[0] + s * orbitOffset[1];
        liftRig.position.z = -s * orbitOffset[0] + c * orbitOffset[1];
      }
      liftRig.rotation.y = st.yaw;
      const car = liftRig.userData.motionCar;
      if (car) car.position.y = liftRig.userData.motionCarRestY + liftTravelAt(st.liftTime) / liftRig.userData.motionLocalScale;
    }
    const live = t >= HERO_SECONDS - 1e-3;
    const k = 1 - Math.exp(-dt * 3);
    st.az += ((live ? state.pointer.x * 0.09 : 0) - st.az) * k;
    st.el += ((live ? state.pointer.y * 0.045 : 0) - st.el) * k;
    if (st.az !== 0 || st.el !== 0) {
      // tmp.rel is a scratch vector: aliasing pos as rel would corrupt the copy below
      tmp.rel.copy(tmp.cam.pos).sub(tmp.cam.target);
      tmp.rel.applyAxisAngle(UPV, -st.az);
      const right = new THREE.Vector3().crossVectors(tmp.rel, UPV).normalize();
      tmp.rel.applyAxisAngle(right, st.el);
      tmp.cam.pos.copy(tmp.cam.target).add(tmp.rel);
    }
    const idle = live ? 1 : 0.35;
    tmp.cam.pos.x += Math.sin(e * 0.24) * 0.05 * idle;
    tmp.cam.pos.y += Math.sin(e * 0.18 + 1.2) * 0.03 * idle;
    camera.position.copy(tmp.cam.pos);
    camera.lookAt(tmp.cam.target);
    if (Math.abs(camera.fov - tmp.cam.fov) > 0.01 || camera.far !== 400) {
      camera.fov = tmp.cam.fov;
      camera.near = 0.05;
      camera.far = 400;
      camera.updateProjectionMatrix();
    }

    // click ripple on the plaza; the cabin's interior light answers with a warm pulse
    const W = world.M;
    if (st.rippleQ) {
      st.rippleQ = false;
      st.rippleAt = e;
    }
    if (st.rippleAt >= 0) {
      const q = (e - st.rippleAt) / 1.3;
      if (q >= 1) {
        st.rippleAt = -1;
        W.ripple.visible = false;
        W.rippleMat.opacity = 0;
      } else {
        W.ripple.visible = true;
        W.ripple.scale.setScalar(1 + q * 7.5);
        W.rippleMat.opacity = (1 - q) * 0.45;
      }
    }

    if (!st.done && t >= HERO_SECONDS) {
      st.done = true;
      store.set({ heroDone: true });
    }

    // atmosphere
    sampleAtmo(t, tmp.atmo);
    if (scene.background && scene.background.isColor) scene.background.copy(tmp.atmo.color);
    if (scene.fog) {
      scene.fog.color.copy(tmp.atmo.color);
      scene.fog.near = tmp.atmo.near;
      scene.fog.far = tmp.atmo.far;
    }
  });

  return (
    <>
      <primitive object={world.group} />
      <Suspense fallback={null}>
        <HeroLift rigRef={liftRef} />
      </Suspense>
    </>
  );
}
