import * as THREE from 'three';
import { mulberry32, TAU, rand, pick } from '../core/rng.js';
import {
  MAT, initMaterials, poplarTrunkGeometry, fallenLogGeometry, mushroomShelfGeometry,
  deadShrubGeometry, grassTuftGeometry, canopyCardGeometry,
} from '../art/models.js';
import { groundTexture, trailLeafTexture, dotTexture, fogTexture, leafCard } from '../art/tex.js';
import { WORLD, CircleGrid } from './layout.js';

/* ============================================================
   FOREST — instanced poplar grove, aurora sky, leaf trail.
   ============================================================ */

const MOON_DIR = new THREE.Vector3(0.46, 0.34, -0.82).normalize();

export class Forest {
  constructor(scene, plan, quality = 'high') {
    this.scene = scene;
    this.plan = plan;
    this.quality = quality;
    this.time = 0;
    this.colliders = new CircleGrid(4);
    this.swayMats = [];
    this.fires = [];
    this.initMaterials = initMaterials;
    initMaterials();

    this._sky();
    this._lights();
    this._ground();
    this._trees();
    this._logsAndFungi();
    this._trail();
    this._scatter();
    this._fireflies();
    this._fogRibbons();
  }

  /* ---------------- sky dome with aurora + moon ---------------- */
  _sky() {
    const uniforms = {
      uTime: { value: 0 },
      uMoon: { value: MOON_DIR.clone() },
      uHorizon: { value: new THREE.Color(0x0d2024) },
      uZenith: { value: new THREE.Color(0x05070f) },
      uAuroraA: { value: new THREE.Color(0x2f8f86) },
      uAuroraB: { value: new THREE.Color(0x5a3f8f) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        precision highp float;
        varying vec3 vDir;
        uniform float uTime;
        uniform vec3 uMoon, uHorizon, uZenith, uAuroraA, uAuroraB;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float noise21(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i), b = hash21(i + vec2(1,0));
          float c = hash21(i + vec2(0,1)), d = hash21(i + vec2(1,1));
          return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise21(p); p *= 2.03; a *= 0.5; }
          return v;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, -0.1, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.75));

          // ---- aurora / witch-light veils ----
          float band = smoothstep(0.02, 0.55, h) * smoothstep(1.0, 0.35, h);
          vec2 q = vec2(atan(dir.z, dir.x) * 1.7 + uTime * 0.012, h * 2.4 - uTime * 0.02);
          float n = fbm(q * 1.7);
          float n2 = fbm(q * 3.1 + 4.7);
          float veil = smoothstep(0.48, 0.95, n * 0.75 + n2 * 0.45) * band;
          vec3 aur = mix(uAuroraA, uAuroraB, smoothstep(0.25, 0.85, n2));
          col += aur * veil * 0.42;
          // thin bright filaments
          float fil = smoothstep(0.72, 0.99, n2) * smoothstep(0.15, 0.7, h) * 0.5;
          col += mix(aur, vec3(0.75, 1.0, 0.92), 0.35) * fil * 0.5;

          // ---- moon ----
          float md = max(dot(dir, normalize(uMoon)), 0.0);
          float disc = smoothstep(0.99930, 0.99975, md);
          float rim = smoothstep(0.9980, 0.9994, md) - disc * 0.6;
          float halo = pow(md, 90.0) * 0.35 + pow(md, 14.0) * 0.12;
          // moon maria
          float maria = fbm(dir.xy * 42.0 + dir.z * 13.0);
          vec3 moonCol = mix(vec3(0.86, 0.82, 0.72), vec3(1.0, 0.95, 0.84), smoothstep(0.35, 0.7, maria));
          col += moonCol * disc * 1.9;
          col += vec3(1.0, 0.72, 0.38) * (rim * 0.5 + halo);

          // ---- stars ----
          vec3 sp = dir * 260.0;
          vec3 cell = floor(sp);
          float rnd = hash21(cell.xz + cell.y * 17.0);
          float star = step(0.9955, rnd) * smoothstep(0.08, 0.35, h);
          float tw = 0.55 + 0.45 * sin(uTime * (1.5 + rnd * 2.5) + rnd * 90.0);
          col += vec3(0.82, 0.9, 1.0) * star * tw * 0.9;

          // ---- faint cloud bands (paper-cut silhouettes) ----
          float cl = fbm(vec2(atan(dir.z, dir.x) * 2.2, h * 5.0 - uTime * 0.006));
          float cloud = smoothstep(0.62, 0.9, cl) * smoothstep(0.02, 0.3, h) * 0.35;
          col = mix(col, vec3(0.05, 0.08, 0.10), cloud);

          // ---- horizon ink ----
          col = mix(col, vec3(0.012, 0.024, 0.026), smoothstep(0.06, -0.12, h));

          // vignette-ish darkening at the very top
          col *= 1.0 - smoothstep(0.75, 1.0, h) * 0.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.skyUniforms = uniforms;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 40, 24), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.sky = sky;

    // the moon as a light source, matching the sky disc
    this.scene.fog = new THREE.FogExp2(0x0a1a1e, WORLD.fogDensity);

    // moon halo sprite to sell atmosphere through the canopy
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: dotTexture(), color: 0xffcf9a, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
    }));
    halo.scale.setScalar(240);
    halo.position.copy(MOON_DIR).multiplyScalar(360);
    halo.renderOrder = -9;
    this.scene.add(halo);
  }

  _lights() {
    const moon = new THREE.DirectionalLight(0xa9d6e2, 0.85);
    moon.position.copy(MOON_DIR).multiplyScalar(80);
    this.scene.add(moon);

    const fill = new THREE.DirectionalLight(0x35506a, 0.35);
    fill.position.set(-40, 30, 60);
    this.scene.add(fill);

    const hemi = new THREE.HemisphereLight(0x1a3a42, 0x0a0d0a, 0.75);
    this.scene.add(hemi);
    this.scene.add(new THREE.AmbientLight(0x142024, 0.55));
  }

  _ground() {
    const tex = groundTexture(11);
    tex.repeat.set(46, 46);
    const mat = new THREE.MeshStandardMaterial({
      map: tex, color: 0x6d7a6c, roughness: 0.98, metalness: 0,
      emissive: 0x0a1712, emissiveIntensity: 0.5,
    });
    const geo = new THREE.CircleGeometry(WORLD.radius + 26, 72);
    geo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geo, mat);
    ground.receiveShadow = false;
    this.scene.add(ground);

    // faint moon pool in the spawn clearing — visual anchor
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(16, 40),
      new THREE.MeshBasicMaterial({
        map: dotTexture(), color: 0x7fd8c8, transparent: true, opacity: 0.07,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.02;
    this.scene.add(pool);
  }

  /* ---------------- trees ---------------- */
  _trees() {
    const rng = mulberry32(4242);
    const trunks = [poplarTrunkGeometry(1), poplarTrunkGeometry(2), poplarTrunkGeometry(3)];
    const canopyCard = canopyCardGeometry();
    const hues = ['ember', 'gold', 'blood', 'ash'];
    const leafMats = hues.map((h) => MAT.leafCard(h));

    const positions = [];
    const count = this.quality === 'low' ? 380 : 640;
    let guard = 0;
    while (positions.length < count && guard < count * 40) {
      guard++;
      const a = rng() * TAU;
      const r = Math.sqrt(rng()) * WORLD.treeWall;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.plan.isFree(x, z, 1.2, true)) continue;
      // keep groves dense but breathable
      let tooClose = false;
      for (let i = positions.length - 1; i >= 0 && i > positions.length - 60; i--) {
        if ((positions[i].x - x) ** 2 + (positions[i].z - z) ** 2 < 7.2) { tooClose = true; break; }
      }
      if (tooClose) continue;
      positions.push({ x, z, s: 0.8 + rng() * 0.7, rot: rng() * TAU, variant: (rng() * 3) | 0 });
    }

    // dense boundary wall so the world feels closed
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * TAU + rng() * 0.02;
      const r = WORLD.treeWall + rng() * 9;
      positions.push({
        x: Math.cos(a) * r, z: Math.sin(a) * r,
        s: 0.9 + rng() * 0.5, rot: rng() * TAU, variant: (rng() * 3) | 0, wall: true,
      });
    }

    const perVariant = [[], [], []];
    for (const p of positions) perVariant[p.variant].push(p);

    this.trunkMeshes = [];
    perVariant.forEach((list, vi) => {
      const mat = MAT.bark.clone();
      mat.color = new THREE.Color(vi === 1 ? 0xb9b1a0 : 0xd2c9b7);
      const mesh = new THREE.InstancedMesh(trunks[vi], mat, list.length);
      mesh.frustumCulled = false;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const v = new THREE.Vector3(), sc = new THREE.Vector3();
      list.forEach((p, i) => {
        e.set((rng() - 0.5) * 0.06, p.rot, (rng() - 0.5) * 0.10);
        q.setFromEuler(e);
        v.set(p.x, 0, p.z);
        sc.set(p.s, p.s * (0.92 + rng() * 0.22), p.s);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        if (!p.wall) this.colliders.add({ x: p.x, z: p.z, r: 0.55 * p.s + 0.18 });
        else this.colliders.add({ x: p.x, z: p.z, r: 0.6 });
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
      this.trunkMeshes.push(mesh);
    });

    // canopy cards, 4 per tree, tinted per instance
    const cards = [];
    const leafColors = {
      ember: [0xd2452b, 0xb03022, 0xe86f3a],
      gold: [0xe59a34, 0xc47a22, 0xffc061],
      blood: [0x8c241a, 0x6d1b14, 0xa8331f],
      ash: [0x6b6559, 0x4f4a40, 0x8a8272],
    };
    for (const p of positions) {
      const per = this.quality === 'low' ? 3 : 4;
      for (let i = 0; i < per; i++) {
        const hue = p.wall ? 'blood' : pick(hues);
        cards.push({
          x: p.x + (rng() - 0.5) * 3.4 * p.s,
          z: p.z + (rng() - 0.5) * 3.4 * p.s,
          y: (7.4 + rng() * 3.4) * p.s,
          s: (3.6 + rng() * 2.8) * p.s,
          rot: rng() * TAU,
          tilt: (rng() - 0.5) * 0.7,
          hue,
          color: pick(leafColors[hue]),
        });
      }
    }
    this.canopyMeshes = [];
    for (const hue of hues) {
      const list = cards.filter((c) => c.hue === hue);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(canopyCard, leafMats[hues.indexOf(hue)], list.length);
      mesh.frustumCulled = false;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
      const v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
      list.forEach((c, i) => {
        e.set(c.tilt, c.rot, c.tilt * 0.6);
        q.setFromEuler(e);
        v.set(c.x, c.y, c.z);
        sc.set(c.s, c.s * (0.75 + Math.random() * 0.3), c.s);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        col.setHex(c.color);
        // subtle variation
        col.offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.08);
        mesh.setColorAt(i, col);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this._sway(leafMats[hues.indexOf(hue)], 0.10, 0.55);
      this.scene.add(mesh);
      this.canopyMeshes.push(mesh);
    }

    // low hanging broken branches near eye level for claustrophobia
    this.scene.add(new THREE.Group());
  }

  _sway(material, amount, speed) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float sway = sin(uTime * ${speed.toFixed(2)} + position.y * 0.7 + position.x * 0.35);
           transformed.x += sway * ${amount.toFixed(3)} * (0.4 + abs(position.y));
           transformed.z += cos(uTime * ${(speed * 0.8).toFixed(2)} + position.x * 0.5) * ${(amount * 0.6).toFixed(3)};`
        );
      material.userData.shader = shader;
    };
    this.swayMats.push(material);
  }

  /* ---------------- fallen logs + shelf mushrooms ---------------- */
  _logsAndFungi() {
    const rng = mulberry32(9091);
    const logs = [];
    const fungi = [];
    let guard = 0;
    while (logs.length < 46 && guard < 3000) {
      guard++;
      const a = rng() * TAU, r = Math.sqrt(rng()) * (WORLD.treeWall - 4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.plan.isFree(x, z, 2.2, false)) continue;
      if (this.plan.distToPath(x, z) < 2.2) continue;
      logs.push({ x, z, rot: rng() * TAU, s: 0.8 + rng() * 0.5 });
    }

    const logGeo = fallenLogGeometry(4);
    const logMat = MATERIALS_log();
    const mesh = new THREE.InstancedMesh(logGeo, logMat, logs.length);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sc = new THREE.Vector3();
    logs.forEach((l, i) => {
      e.set(0, l.rot, 0);
      q.setFromEuler(e);
      v.set(l.x, 0, l.z);
      sc.setScalar(l.s);
      m4.compose(v, q, sc);
      mesh.setMatrixAt(i, m4);
      // collider along the log
      for (let k = -1; k <= 1; k++) {
        this.colliders.add({
          x: l.x + Math.cos(l.rot) * k * 2.2 * l.s,
          z: l.z - Math.sin(l.rot) * k * 2.2 * l.s,
          r: 0.5 * l.s + 0.15,
        });
      }
      // mushrooms on top
      const n = 2 + ((rng() * 3) | 0);
      for (let k = 0; k < n; k++) {
        fungi.push({
          x: l.x + (rng() - 0.5) * 5 * l.s,
          z: l.z + (rng() - 0.5) * 1.2 * l.s,
          y: 0.42 * l.s,
          rot: rng() * TAU,
          s: 0.7 + rng() * 0.9,
        });
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    this.logs = logs;

    if (fungi.length) {
      const fmat = new THREE.MeshStandardMaterial({
        color: 0xbd6a2e, roughness: 0.85, emissive: 0x70320c, emissiveIntensity: 0.75,
      });
      const fm = new THREE.InstancedMesh(mushroomShelfGeometry(), fmat, fungi.length);
      fm.frustumCulled = false;
      fungi.forEach((f, i) => {
        e.set(0, f.rot, 0); q.setFromEuler(e);
        v.set(f.x, f.y, f.z); sc.setScalar(f.s);
        m4.compose(v, q, sc);
        fm.setMatrixAt(i, m4);
      });
      fm.instanceMatrix.needsUpdate = true;
      this.scene.add(fm);
    }
  }

  /* ---------------- crimson leaf trail ---------------- */
  _trail() {
    const pts = this.plan.path;
    const geo = new THREE.PlaneGeometry(0.55, 0.42);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: trailLeafTexture(), color: 0xffb066, alphaTest: 0.4,
      transparent: false, roughness: 0.9, side: THREE.DoubleSide,
      emissive: 0x82300c, emissiveIntensity: 1.1,
    });
    const count = pts.length * 3;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    let i = 0;
    const rng = mulberry32(313);
    for (const p of pts) {
      for (let k = 0; k < 3; k++) {
        const a = rng() * TAU, r = Math.sqrt(rng()) * 2.2;
        e.set(0, rng() * TAU, 0); q.setFromEuler(e);
        v.set(p.x + Math.cos(a) * r, 0.03 + rng() * 0.02, p.z + Math.sin(a) * r);
        sc.setScalar(0.7 + rng() * 1.1);
        m4.compose(v, q, sc);
        mesh.setMatrixAt(i, m4);
        col.setHSL(0.06 + rng() * 0.05, 0.85, 0.35 + rng() * 0.2);
        mesh.setColorAt(i, col);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.trailMesh = mesh;

    // way lanterns: small markers that light up when pinged
    this.wayLanterns = [];
    for (const w of this.plan.waylanterns) {
      const g = new THREE.Group();
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, 1.4, 5),
        new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 1 })
      );
      post.position.y = 0.7;
      g.add(post);
      const cage = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.34, 0.28),
        new THREE.MeshStandardMaterial({
          color: 0x3a2a16, roughness: 0.9, emissive: 0x000000, transparent: true, opacity: 0.9,
        })
      );
      cage.position.y = 1.5;
      g.add(cage);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: dotTexture(), color: 0xffb066, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.setScalar(1.8);
      glow.position.y = 1.5;
      g.add(glow);
      g.position.set(w.x, 0, w.z);
      this.scene.add(g);
      this.wayLanterns.push({ group: g, glow, cage: cage.material, litAt: -99 });
      this.colliders.add({ x: w.x, z: w.z, r: 0.25 });
    }
  }

  /* ---------------- grass, shrubs, stones ---------------- */
  _scatter() {
    const rng = mulberry32(5150);
    const grassGeo = grassTuftGeometry();
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x3d4a35, roughness: 1, side: THREE.DoubleSide,
      emissive: 0x0a1208, emissiveIntensity: 0.4,
    });
    this._sway(grassMat, 0.06, 1.4);
    const grassCount = this.quality === 'low' ? 900 : 2400;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
    grass.frustumCulled = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < grassCount; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * (WORLD.treeWall + 4);
      e.set(0, rng() * TAU, 0); q.setFromEuler(e);
      v.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      sc.set(0.7 + rng() * 0.9, 0.6 + rng() * 1.2, 0.7 + rng() * 0.9);
      m4.compose(v, q, sc);
      grass.setMatrixAt(i, m4);
      col.setHSL(0.22 + rng() * 0.06, 0.16 + rng() * 0.14, 0.10 + rng() * 0.12);
      grass.setColorAt(i, col);
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.scene.add(grass);

    // dead shrubs (red shrubs of 26.3, dried out)
    const shrubGeo = deadShrubGeometry(3);
    const shrubMat = new THREE.MeshStandardMaterial({
      color: 0x7a2c1d, roughness: 1, emissive: 0x1a0806, emissiveIntensity: 0.6,
    });
    const shrubCount = 420;
    const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCount);
    shrubs.frustumCulled = false;
    for (let i = 0; i < shrubCount; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * (WORLD.treeWall + 2);
      e.set(0, rng() * TAU, 0); q.setFromEuler(e);
      v.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      sc.setScalar(0.8 + rng() * 1.3);
      m4.compose(v, q, sc);
      shrubs.setMatrixAt(i, m4);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    this.scene.add(shrubs);

    // mossy stones
    const stoneGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4c5450, roughness: 1 });
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, 160);
    stones.frustumCulled = false;
    for (let i = 0; i < 160; i++) {
      const a = rng() * TAU, r = Math.sqrt(rng()) * (WORLD.treeWall - 6);
      e.set(rng() * TAU, rng() * TAU, rng() * TAU); q.setFromEuler(e);
      v.set(Math.cos(a) * r, 0.1 + rng() * 0.1, Math.sin(a) * r);
      sc.set(0.5 + rng() * 1.4, 0.3 + rng() * 0.6, 0.5 + rng() * 1.4);
      m4.compose(v, q, sc);
      stones.setMatrixAt(i, m4);
    }
    stones.instanceMatrix.needsUpdate = true;
    this.scene.add(stones);
  }

  /* ---------------- fireflies ---------------- */
  _fireflies() {
    const N = this.quality === 'low' ? 120 : 320;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (WORLD.treeWall - 8);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = 0.4 + Math.random() * 3.4;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: dotTexture() },
        uColor: { value: new THREE.Color(0xffcf7a) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uPixelRatio;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.35 + aSeed * 30.0) * 0.9;
          p.y += sin(uTime * 0.55 + aSeed * 12.0) * 0.5;
          p.z += cos(uTime * 0.3 + aSeed * 20.0) * 0.9;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (18.0 + aSeed * 22.0) * uPixelRatio / max(1.0, -mv.z * 0.12);
          float blink = 0.5 + 0.5 * sin(uTime * (1.2 + aSeed * 2.5) + aSeed * 60.0);
          vAlpha = pow(blink, 2.2) * smoothstep(140.0, 4.0, -mv.z);
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(uColor, t.a * vAlpha * 0.85);
        }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    this.fireflies = points;
  }

  /* ---------------- low fog ribbons ---------------- */
  _fogRibbons() {
    const geo = new THREE.PlaneGeometry(26, 7, 1, 1);
    const tex = fogTexture();
    this.ribbons = [];
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0x9fd6cf, transparent: true, opacity: 0.10,
        depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const s = new THREE.Sprite(mat);
      const a = Math.random() * TAU, r = 8 + Math.random() * (WORLD.treeWall - 12);
      s.position.set(Math.cos(a) * r, 1.6 + Math.random() * 2.6, Math.sin(a) * r);
      s.scale.set(22 + Math.random() * 22, 5 + Math.random() * 3, 1);
      s.userData = { a, r, drift: 0.02 + Math.random() * 0.04, phase: Math.random() * TAU, baseY: s.position.y };
      this.scene.add(s);
      this.ribbons.push(s);
    }
  }

  /* ---------------- public ---------------- */
  revealWayLanterns() {
    const t = performance.now() / 1000;
    for (const w of this.wayLanterns) w.litAt = t;
  }

  update(dt, time, playerPos) {
    this.time = time;
    this.skyUniforms.uTime.value = time;
    for (const m of this.swayMats) {
      if (m.userData.shader) m.userData.shader.uniforms.uTime.value = time;
    }
    if (this.fireflies) this.fireflies.material.uniforms.uTime.value = time;

    for (const s of this.ribbons) {
      const u = s.userData;
      s.position.x += Math.sin(u.phase + time * u.drift) * dt * 0.5;
      s.position.z += Math.cos(u.phase + time * u.drift * 0.8) * dt * 0.4;
      s.position.y = u.baseY + Math.sin(time * 0.18 + u.phase) * 0.4;
      s.material.opacity = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(time * 0.25 + u.phase));
    }

    for (const w of this.wayLanterns) {
      const age = performance.now() / 1000 - w.litAt;
      const k = age < 2.2 ? Math.sin(Math.min(age / 2.2, 1) * Math.PI) : 0;
      w.glow.material.opacity = k * 0.85;
      w.cage.emissive.setRGB(0.9 * k, 0.45 * k, 0.1 * k);
    }
  }
}

function MATERIALS_log() {
  return new THREE.MeshStandardMaterial({
    map: MAT.bark.map, color: 0x6b6455, roughness: 1,
  });
}
