import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, TAU } from '../core/rng.js';
import {
  poplarBark, leafCard, stoneTexture, pumpkinFaceTexture, glowTexture,
} from './tex.js';

/* ============================================================
   Geometry factories. Everything is procedural, low-poly and
   deliberately silhouette-first: the game is played in fog.
   ============================================================ */

const M = (opts) => new THREE.MeshStandardMaterial(opts);
const MB = (opts) => new THREE.MeshBasicMaterial(opts);

export const MAT = {
  bark: null,
  barkDark: null,
  stone: null,
  leaf: {},
  ember: null,
  bone: null,
};

export function initMaterials() {
  MAT.bark = M({ map: poplarBark(7), color: 0xcfc7b6, roughness: 0.95, metalness: 0.0 });
  MAT.barkDark = M({ map: poplarBark(12), color: 0x6a6458, roughness: 1 });
  MAT.stone = M({ map: stoneTexture(5), color: 0x9aa39c, roughness: 0.98 });
  MAT.bone = M({ color: 0xe9e0cc, roughness: 0.7, emissive: 0x2a2010, emissiveIntensity: 0.35 });
  MAT.ember = MB({ color: 0xffb056 });
  MAT.emberGlow = new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xff9a3c, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  MAT.leafCard = (hue) => {
    if (!MAT.leaf[hue]) {
      MAT.leaf[hue] = new THREE.MeshStandardMaterial({
        map: leafCard(hue === 'gold' ? 31 : hue === 'blood' ? 41 : 21, hue),
        transparent: false, alphaTest: 0.42, side: THREE.DoubleSide,
        roughness: 1, metalness: 0, color: 0xffffff,
        emissive: new THREE.Color(hue === 'gold' ? 0x2a1a06 : 0x120604),
        emissiveIntensity: 0.6,
      });
    }
    return MAT.leaf[hue];
  };
}

/* ---------------- merger that is tolerant of attribute mismatch ---------------- */
function merge(list) {
  const clean = list.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    // keep only position/normal/uv
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', ng.getAttribute('position'));
    out.setAttribute('normal', ng.getAttribute('normal') || (() => {
      const n = new Float32Array(ng.getAttribute('position').count * 3);
      return new THREE.BufferAttribute(n, 3);
    })());
    const uv = ng.getAttribute('uv');
    out.setAttribute('uv', uv || new THREE.BufferAttribute(new Float32Array((ng.getAttribute('position').count) * 2), 2));
    return out;
  });
  const g = mergeGeometries(clean, false);
  g.computeVertexNormals();
  return g;
}

/* ============================================================
   POPLAR — pale banded trunk, high bare branches
   ============================================================ */
export function poplarTrunkGeometry(seed = 1) {
  const r = mulberry32(seed * 977 + 13);
  const parts = [];

  const h = 8 + r() * 5;
  const rBottom = 0.30 + r() * 0.14;
  const rTop = 0.09 + r() * 0.05;
  const segs = 7;
  const trunk = new THREE.CylinderGeometry(rTop, rBottom, h, segs, 4, true);
  trunk.translate(0, h / 2, 0);
  // flare at the base
  const flare = new THREE.CylinderGeometry(rBottom * 1.05, rBottom * 1.65, 1.1, segs, 1, true);
  flare.translate(0, 0.55, 0);
  parts.push(trunk, flare);

  // branches
  const nb = 3 + Math.floor(r() * 3);
  for (let i = 0; i < nb; i++) {
    const by = h * (0.52 + r() * 0.42);
    const len = (h - by) * (0.5 + r() * 0.7) + 0.8;
    const ang = r() * TAU;
    const tilt = 0.55 + r() * 0.55;
    const br = new THREE.CylinderGeometry(0.025, 0.075, len, 5, 2, true);
    br.translate(0, len / 2, 0);
    br.rotateZ(tilt);
    br.rotateY(ang);
    br.translate(0, by, 0);
    parts.push(br);

    // forked twig
    if (r() > 0.35) {
      const len2 = len * (0.35 + r() * 0.4);
      const tw = new THREE.CylinderGeometry(0.012, 0.03, len2, 4, 1, true);
      tw.translate(0, len2 / 2, 0);
      tw.rotateZ(tilt + 0.5 + r() * 0.6);
      tw.rotateY(ang + (r() - 0.5));
      const bx = Math.sin(tilt) * len * 0.85, byy = Math.cos(tilt) * len * 0.85 + by;
      tw.translate(Math.cos(ang) * bx, byy, Math.sin(ang) * bx);
      parts.push(tw);
    }
  }

  // root claws
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + r();
    const len = 0.9 + r() * 1.3;
    const root = new THREE.CylinderGeometry(0.035, 0.14, len, 5, 1, true);
    root.translate(0, len / 2, 0);
    root.rotateZ(Math.PI / 2 - 0.25 - r() * 0.3);
    root.rotateY(a);
    root.translate(0, 0.12, 0);
    parts.push(root);
  }

  return merge(parts);
}

/* canopy card: one quad with irregular alpha cut-outs */
export function canopyCardGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 1, 1);
  return g;
}

/* ============================================================
   FALLEN POPLAR LOG (26.3 added these — use them as landmarks)
   ============================================================ */
export function fallenLogGeometry(seed = 4) {
  const r = mulberry32(seed * 131);
  const parts = [];
  const len = 7 + r() * 4;
  const rad = 0.32 + r() * 0.16;
  const log = new THREE.CylinderGeometry(rad * 0.72, rad, len, 7, 3, false);
  log.rotateZ(Math.PI / 2);
  log.translate(0, rad, 0);
  parts.push(log);
  // broken stubs
  for (let i = 0; i < 4; i++) {
    const l = 0.5 + r() * 1.2;
    const stub = new THREE.CylinderGeometry(0.03, 0.09, l, 4, 1, true);
    stub.translate(0, l / 2, 0);
    stub.rotateZ((r() - 0.5) * 1.5);
    stub.rotateX((r() - 0.5) * 1.5);
    stub.translate((r() - 0.5) * len * 0.8, rad * 0.9, 0);
    parts.push(stub);
  }
  return merge(parts);
}

/* ============================================================
   SHELF MUSHROOM (26.3) — glowing fungal shelves on logs
   ============================================================ */
export function mushroomShelfGeometry() {
  const cap = new THREE.SphereGeometry(0.22, 8, 4, 0, TAU, 0, Math.PI / 2);
  cap.scale(1, 0.32, 0.8);
  const stem = new THREE.CylinderGeometry(0.03, 0.05, 0.12, 4);
  stem.translate(0, 0.06, 0);
  return merge([cap, stem]);
}

/* ============================================================
   PUMPKIN LANTERN — one lit mesh + emissive face
   ============================================================ */
export function makePumpkinLantern(size = 1) {
  const g = new THREE.Group();
  const bodyMat = M({ color: 0x7d3a12, roughness: 0.85, emissive: 0x30100a, emissiveIntensity: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34 * size, 14, 10), bodyMat);
  body.scale.set(1, 0.78, 1);
  body.position.y = 0.30 * size;
  g.add(body);

  // ribs
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(0.335 * size, 0.012 * size, 3, 18, Math.PI),
      M({ color: 0x5b2a0d, roughness: 1 })
    );
    r.rotation.y = (i / 7) * TAU;
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.30 * size;
    r.scale.set(1, 1, 0.78);
    g.add(r);
  }

  // carved face plane
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5 * size, 0.44 * size),
    MB({ map: pumpkinFaceTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  face.position.set(0, 0.30 * size, 0.335 * size);
  g.add(face);

  // glowing core
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: 0xffa04a, transparent: true, opacity: 0.9,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  core.scale.setScalar(1.7 * size);
  core.position.y = 0.32 * size;
  g.add(core);

  // stem
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.16, 5), M({ color: 0x3a2a16 }));
  stem.position.y = 0.62 * size;
  stem.rotation.z = 0.2;
  g.add(stem);

  g.userData.face = face;
  g.userData.core = core;
  g.userData.bodyMat = bodyMat;
  return g;
}

/* ============================================================
   SHRINE — stacked stones + bone antlers + rune ring
   ============================================================ */
export function makeShrine() {
  const g = new THREE.Group();
  const stoneMat = MAT.stone;
  const r = mulberry32(777);

  // cairn
  let y = 0;
  for (let i = 0; i < 5; i++) {
    const s = 0.55 - i * 0.08;
    const geo = new THREE.IcosahedronGeometry(s, 0);
    const pos = geo.getAttribute('position');
    for (let k = 0; k < pos.count; k++) {
      pos.setXYZ(k,
        pos.getX(k) * (0.85 + r() * 0.3),
        pos.getY(k) * (0.55 + r() * 0.2),
        pos.getZ(k) * (0.85 + r() * 0.3));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, stoneMat);
    m.position.set((r() - 0.5) * 0.18, y + 0.22, (r() - 0.5) * 0.18);
    m.rotation.y = r() * TAU;
    g.add(m);
    y += 0.3;
  }

  // bone antler totem on top
  const boneMat = MAT.bone;
  for (let i = 0; i < 4; i++) {
    const len = 1.1 + r() * 0.8;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.05, len, 4), boneMat);
    b.position.set(0, y + len * 0.42, 0);
    b.rotation.z = (r() - 0.5) * 1.1;
    b.rotation.x = (r() - 0.5) * 1.1;
    g.add(b);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), MAT.ember);
    tip.position.set(
      Math.sin(b.rotation.z) * -len * 0.45,
      y + len * 0.42 + Math.cos(b.rotation.z) * len * 0.42,
      Math.sin(b.rotation.x) * len * 0.4
    );
    g.add(tip);
  }

  // rune ring on the ground (separate mesh so it can glow when lit)
  const ringMat = MB({
    color: 0xff9b3d, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  });
  return { group: g, ringMat, height: y };
}

/* ============================================================
   DEAD BUSH / RED SHRUB (26.3 red shrubs, dried for Halloween)
   ============================================================ */
export function deadShrubGeometry(seed = 1) {
  const r = mulberry32(seed * 61);
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const len = 0.4 + r() * 0.8;
    const b = new THREE.CylinderGeometry(0.006, 0.022, len, 3, 1, true);
    b.translate(0, len / 2, 0);
    b.rotateZ((r() - 0.5) * 1.25);
    b.rotateY(r() * TAU);
    parts.push(b);
  }
  return merge(parts);
}

/* ============================================================
   GRASS TUFT — crossed alpha-less blades, cheap
   ============================================================ */
export function grassTuftGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(0.5, 0.55, 1, 1);
    p.translate(0, 0.27, 0);
    p.rotateY((i / 3) * Math.PI);
    parts.push(p);
  }
  return merge(parts);
}

/* ============================================================
   THE HOLLOW STAG — the thing that moves when you don't look
   ============================================================ */
export function makeStag() {
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);

  const woodMat = M({
    color: 0x241a15, roughness: 0.92, metalness: 0.05,
    emissive: 0x120a06, emissiveIntensity: 0.4,
  });
  const boneMat = M({ color: 0xd8cdb6, roughness: 0.8, emissive: 0x1a1208, emissiveIntensity: 0.35 });
  const coreMat = MB({ color: 0xff7a2e, transparent: true, opacity: 0.9 });
  const eyeMat = new THREE.SpriteMaterial({
    map: glowTexture('#fff2c0', '#ffa243', 'rgba(255,60,10,0)'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.95,
  });

  const materials = [woodMat, boneMat, coreMat];

  // ---- torso: open ribcage around a burning hollow ----
  const torso = new THREE.Group();
  torso.position.y = 2.28;
  rig.add(torso);

  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 1.9, 6), boneMat);
  spine.rotation.z = Math.PI / 2;
  spine.position.set(0, 0.36, 0);
  torso.add(spine);

  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const rad = 0.46 - Math.abs(t - 0.45) * 0.34;
    const rib = new THREE.Mesh(
      new THREE.TorusGeometry(rad, 0.035, 4, 14, Math.PI * 1.25),
      i % 2 ? boneMat : woodMat
    );
    rib.rotation.y = Math.PI / 2;
    rib.rotation.z = Math.PI * 0.38;
    rib.position.set(-0.72 + i * 0.24, 0.36, 0);
    rib.scale.set(1, 0.85, 1);
    torso.add(rib);
  }

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.30, 1), coreMat);
  core.position.set(0, 0.36, 0);
  core.scale.set(1.5, 0.8, 1);
  torso.add(core);

  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('#fff0c0', '#ff8a30', 'rgba(255,40,0,0)'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8,
  }));
  coreGlow.scale.setScalar(2.2);
  coreGlow.position.set(0, 0.36, 0);
  torso.add(coreGlow);

  // tattered moss cloak strips
  for (let i = 0; i < 8; i++) {
    const len = 1.1 + Math.random() * 1.0;
    const w = 0.16 + Math.random() * 0.18;
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(w, len, 1, 3),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.28 + Math.random() * 0.06, 0.18, 0.09 + Math.random() * 0.05),
        side: THREE.DoubleSide, roughness: 1, transparent: true, opacity: 0.92,
        emissive: 0x0a0f08, emissiveIntensity: 0.4,
      })
    );
    strip.position.set((Math.random() - 0.5) * 1.3, 0.36 - len / 2, -0.28 + Math.random() * 0.36);
    strip.rotation.y = (Math.random() - 0.5) * 0.9;
    strip.userData.baseRot = strip.rotation.x;
    strip.userData.phase = Math.random() * TAU;
    torso.add(strip);
  }

  // ---- neck + skull ----
  const neckPivot = new THREE.Group();
  neckPivot.position.set(0.86, 0.62, 0);
  torso.add(neckPivot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.2, 1.15, 6), woodMat);
  neck.rotation.z = -0.72;
  neck.position.set(0.26, 0.42, 0);
  neckPivot.add(neck);

  const head = new THREE.Group();
  head.position.set(0.82, 0.82, 0);
  head.rotation.z = -0.18;
  neckPivot.add(head);

  const skull = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 0.72, 5), boneMat);
  skull.rotation.z = Math.PI / 2 - 0.25;
  head.add(skull);
  const muzzle = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.55, 5), boneMat);
  muzzle.rotation.z = -Math.PI / 2 - 0.12;
  muzzle.position.set(0.5, -0.12, 0);
  head.add(muzzle);

  // eyes
  const eyes = [];
  for (const z of [-0.16, 0.16]) {
    const e = new THREE.Sprite(eyeMat.clone());
    e.scale.setScalar(0.33);
    e.position.set(0.12, 0.06, z);
    head.add(e);
    eyes.push(e);
  }

  // antlers: recursive bare branches
  const antlerTips = [];
  function antler(parent, len, rad, dir, depth) {
    if (depth <= 0 || len < 0.12) return;
    const geo = new THREE.CylinderGeometry(rad * 0.55, rad, len, 4);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, woodMat);
    const pivot = new THREE.Group();
    pivot.position.copy(dir.start || new THREE.Vector3());
    parent.add(pivot);
    pivot.add(m);
    m.rotation.z = dir.angle;
    m.rotation.x = dir.side;
    const end = new THREE.Vector3(
      Math.sin(dir.angle) * Math.cos(dir.side) * len,
      Math.cos(dir.angle) * len,
      Math.sin(dir.side) * len
    ).add(pivot.position);
    antlerTips.push(end);
    const branches = depth > 2 ? 3 : 2;
    for (let i = 0; i < branches; i++) {
      antler(pivot, len * (0.62 + Math.random() * 0.16), rad * 0.66, {
        angle: dir.angle + (Math.random() - 0.5) * 1.5,
        side: dir.side + (Math.random() - 0.5) * 1.5,
        start: new THREE.Vector3(0, len * (0.55 + Math.random() * 0.4), 0),
      }, depth - 1);
    }
  }
  antler(head, 0.85, 0.075, { angle: 0.3, side: 0.35 }, 4);
  antler(head, 0.8, 0.07, { angle: 0.15, side: -0.4 }, 4);

  // faint ember tips on the antlers
  const tipMat = MB({ color: 0xff9a3c });
  for (const t of antlerTips.slice(-8)) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 3), tipMat);
    s.position.copy(t);
    head.add(s);
  }

  // ---- legs ----
  const legs = [];
  const legDefs = [
    { x: 0.66, z: 0.34, phase: 0 },
    { x: 0.66, z: -0.34, phase: Math.PI },
    { x: -0.72, z: 0.34, phase: Math.PI },
    { x: -0.72, z: -0.34, phase: 0 },
  ];
  for (const d of legDefs) {
    const hip = new THREE.Group();
    hip.position.set(d.x, 2.16, d.z);
    rig.add(hip);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.15, 5), woodMat);
    upper.position.y = -0.58;
    hip.add(upper);
    const knee = new THREE.Group();
    knee.position.y = -1.14;
    hip.add(knee);
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 1.0, 5), woodMat);
    lower.position.y = -0.5;
    knee.add(lower);
    const hoof = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.26, 4), boneMat);
    hoof.rotation.x = Math.PI;
    hoof.position.y = -1.05;
    knee.add(hoof);
    legs.push({ hip, knee, phase: d.phase, base: hip.rotation.x });
  }

  // frost/decay ring at the feet (visible when frozen)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x6fe3d6, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.35, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);

  return {
    root, rig, torso, head, neckPivot, legs, core, coreGlow, eyes, ring, materials,
    woodMat, boneMat, coreMat, eyeMat,
  };
}

/* ---------------- fire (for lit shrines) ---------------- */
export function makeFlame(scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.SpriteMaterial({
    map: glowTexture('#fffdf0', '#ffc061', 'rgba(255,90,20,0)'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(mat.clone());
    s.scale.setScalar((1.0 - i * 0.22) * scale);
    s.position.set((Math.random() - 0.5) * 0.2, 0.2 + i * 0.12, (Math.random() - 0.5) * 0.2);
    s.userData.base = s.scale.x;
    s.userData.phase = Math.random() * TAU;
    g.add(s);
  }
  g.userData.mats = g.children.map((c) => c.material);
  return g;
}
