import * as THREE from 'three';
import { mulberry32, TAU } from '../core/rng.js';
import {
  makePumpkinLantern, makeShrine, makeFlame, MAT,
} from '../art/models.js';
import { runeRingTexture, glowTexture, dotTexture } from '../art/tex.js';

/* ============================================================
   PROPS — shrines, abandoned camps, the ritual circle.
   These are the only warm lights in a very cold forest.
   ============================================================ */

export class Props {
  constructor(scene, plan, colliders) {
    this.scene = scene;
    this.plan = plan;
    this.colliders = colliders;
    this.shrines = [];
    this.time = 0;
    this._shrines();
    this._camps();
    this._ritual();
  }

  /* ---------------- four shrines ---------------- */
  _shrines() {
    for (const s of this.plan.shrines) {
      const group = new THREE.Group();
      group.position.set(s.x, 0, s.z);

      const { group: cairn, height } = makeShrine();
      group.add(cairn);

      // rune ring decal
      const ringMat = new THREE.MeshBasicMaterial({
        map: runeRingTexture(21 + s.id), transparent: true, opacity: 0.16,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
        color: 0xff9b3d,
      });
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(ring);

      // pumpkins on the ring
      const rng = mulberry32(500 + s.id * 31);
      const pumpkins = [];
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rng() * 0.2;
        const rad = 3.5 + rng() * 0.4;
        const p = makePumpkinLantern(0.85 + rng() * 0.35);
        p.position.set(Math.cos(a) * rad, 0, Math.sin(a) * rad);
        p.rotation.y = -a + Math.PI / 2;
        p.userData.face.material.opacity = 0;
        p.userData.core.material.opacity = 0;
        p.userData.bodyMat.emissiveIntensity = 0.15;
        group.add(p);
        pumpkins.push(p);
      }

      const light = new THREE.PointLight(0xff9b3d, 0, 18, 2);
      light.position.y = 2.0;
      group.add(light);

      const flame = makeFlame(1.3);
      flame.position.y = height + 0.2;
      flame.visible = false;
      group.add(flame);

      this.scene.add(group);
      this.colliders.add({ x: s.x, z: s.z, r: 1.35 });

      this.shrines.push({
        ...s, group, lit: false, amount: 0, flame, light, ringMat, ring, pumpkins,
      });
    }
  }

  /* ---------------- abandoned camps (Wilderness Bound 26.3) ---------------- */
  _camps() {
    const wood = new THREE.MeshStandardMaterial({ color: 0x2c2118, roughness: 1 });
    const cloth = new THREE.MeshStandardMaterial({
      color: 0x33251c, roughness: 1, side: THREE.DoubleSide, emissive: 0x0a0604, emissiveIntensity: 0.5,
    });
    const straw = new THREE.MeshStandardMaterial({ color: 0x7a6428, roughness: 1 });

    for (const c of this.plan.camps) {
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      g.rotation.y = c.rot;

      if (c.kind === 'tent' || c.kind === 'beds') {
        // tent: two leaning planes + poles
        const tent = new THREE.Group();
        for (const side of [-1, 1]) {
          const p = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4, 1, 1), cloth);
          p.position.set(0, 1.05, side * 0.72);
          p.rotation.x = side * 0.42;
          p.rotation.z = 0.06;
          tent.add(p);
        }
        for (const x of [-1.5, 1.5]) {
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.3, 4), wood);
          pole.position.set(x, 1.15, 0);
          pole.rotation.z = -0.12;
          tent.add(pole);
        }
        tent.position.set(-3, 0, 1.5);
        tent.rotation.y = 0.4;
        g.add(tent);
        this.colliders.add({ x: c.x - 3, z: c.z + 1.5, r: 1.6 });
      }

      if (c.kind === 'wagon') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.3, 1.7), wood);
        body.position.y = 1.0;
        body.rotation.z = 0.16;
        g.add(body);
        for (const z of [-0.9, 0.9]) {
          const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 5, 12), wood);
          wheel.rotation.y = Math.PI / 2;
          wheel.position.set(0.9, 0.62, z);
          g.add(wheel);
        }
        // broken wheel on the ground
        const broken = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 5, 12, Math.PI * 1.3), wood);
        broken.rotation.x = -Math.PI / 2;
        broken.position.set(2.6, 0.06, -1.4);
        g.add(broken);
        this.colliders.add({ x: c.x, z: c.z, r: 1.9 });
      }

      // campfire: cold stones + charred logs
      const fire = new THREE.Group();
      fire.position.set(2.2, 0, -1.6);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18 + Math.random() * 0.1, 0), MAT.stone);
        st.position.set(Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7);
        st.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        fire.add(st);
      }
      for (let i = 0; i < 4; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 5), wood);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = (i / 4) * TAU;
        log.position.y = 0.1;
        fire.add(log);
      }
      g.add(fire);
      this.colliders.add({ x: c.x + 2.2, z: c.z - 1.6, r: 0.8 });

      // straw beds (26.3) — flattened, abandoned
      if (c.kind !== 'wagon') {
        for (let i = 0; i < 2; i++) {
          const bed = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.9), straw);
          bed.position.set(-0.6 + i * 2.4, 0.08, -2.6);
          bed.rotation.y = 0.2 + i * 0.3;
          g.add(bed);
        }
      }

      // hanging bone charm
      const charm = new THREE.Group();
      charm.position.set(1.2, 2.1, 1.2);
      for (let i = 0; i < 3; i++) {
        const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.4 + i * 0.1, 4), MAT.bone);
        bone.position.set((i - 1) * 0.18, -0.2 - i * 0.06, 0);
        bone.rotation.z = (i - 1) * 0.12;
        charm.add(bone);
      }
      g.add(charm);

      this.scene.add(g);
    }
  }

  /* ---------------- ritual circle at spawn ---------------- */
  _ritual() {
    const g = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({
      map: runeRingTexture(99), transparent: true, opacity: 0.28, color: 0xffb066,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);

    // standing stones
    const r = mulberry32(808);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.2;
      const h = 1.6 + r() * 1.2;
      const geo = new THREE.IcosahedronGeometry(0.55, 0);
      geo.scale(0.7, h, 0.5);
      const m = new THREE.Mesh(geo, MAT.stone);
      m.position.set(Math.cos(a) * 6.4, h * 0.5, Math.sin(a) * 6.4);
      m.rotation.y = r() * TAU;
      m.rotation.z = (r() - 0.5) * 0.15;
      g.add(m);
      this.colliders.add({ x: Math.cos(a) * 6.4, z: Math.sin(a) * 6.4, r: 0.55 });
    }

    // central altar stone
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.55, 7), MAT.stone);
    altar.position.y = 0.27;
    g.add(altar);
    this.colliders.add({ x: 0, z: 0, r: 1.25 });

    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#fff6d0', '#ffb35c', 'rgba(255,80,10,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    }));
    core.scale.setScalar(8);
    core.position.y = 1.4;
    g.add(core);

    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffb066, transparent: true, opacity: 0, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 2.4, 40, 12, 1, true), beamMat);
    beam.position.y = 20;
    g.add(beam);

    const light = new THREE.PointLight(0xffa04a, 0, 24, 2);
    light.position.y = 2.2;
    g.add(light);

    this.scene.add(g);
    this.ritual = { group: g, ring, ringMat, core, beam, beamMat, light, active: false, amount: 0 };
  }

  /* ---------------- public ---------------- */
  ignite(shrine) {
    if (shrine.lit) return false;
    shrine.lit = true;
    shrine.flame.visible = true;
    for (const p of shrine.pumpkins) {
      p.userData.face.material.opacity = 1;
      p.userData.core.material.opacity = 0.9;
      p.userData.bodyMat.emissiveIntensity = 1.1;
      p.userData.bodyMat.emissive.setHex(0x79230a);
    }
    return true;
  }

  setRitualActive(v) {
    this.ritual.active = v;
  }

  reset() {
    for (const s of this.shrines) {
      s.lit = false;
      s.amount = 0;
      s.flame.visible = false;
      s.light.intensity = 0;
      s.ringMat.opacity = 0.16;
      for (const p of s.pumpkins) {
        p.userData.face.material.opacity = 0;
        p.userData.core.material.opacity = 0;
        p.userData.bodyMat.emissiveIntensity = 0.15;
        p.userData.bodyMat.emissive.setHex(0x30100a);
      }
    }
    this.ritual.active = false;
    this.ritual.amount = 0;
    this.ritual.core.material.opacity = 0;
    this.ritual.beamMat.opacity = 0;
    this.ritual.light.intensity = 0;
  }

  litCount() {
    return this.shrines.filter((s) => s.lit).length;
  }

  nearestUnlitShrine(pos) {
    let best = null, bd = 1e9;
    for (const s of this.shrines) {
      if (s.lit) continue;
      const d = Math.hypot(s.x - pos.x, s.z - pos.z);
      if (d < bd) { bd = d; best = s; }
    }
    return { shrine: best, dist: bd };
  }

  update(dt, time) {
    this.time = time;

    for (const s of this.shrines) {
      const target = s.lit ? 1 : 0;
      s.amount += (target - s.amount) * Math.min(1, dt * 1.6);
      s.light.intensity = s.amount * (3.2 + Math.sin(time * 9 + s.id) * 0.35 + Math.sin(time * 23.3) * 0.15);
      s.ringMat.opacity = 0.14 + s.amount * 0.55 + Math.sin(time * 2 + s.id) * 0.03;
      if (s.ring) s.ring.rotation.z = time * (s.lit ? 0.05 : 0.008);
      if (s.flame.visible) {
        s.flame.children.forEach((sp, i) => {
          const k = sp.userData.base * (1 + Math.sin(time * (6 + i) + sp.userData.phase) * 0.18);
          sp.scale.setScalar(k);
          sp.material.opacity = 0.55 + Math.sin(time * 8 + i) * 0.2;
        });
      }
      for (const p of s.pumpkins) {
        const fl = 0.85 + Math.sin(time * 7 + p.position.x * 3) * 0.12 + Math.sin(time * 19 + p.position.z) * 0.05;
        p.userData.core.scale.setScalar(1.7 * fl);
      }
    }

    const R = this.ritual;
    const target = R.active ? 1 : 0;
    R.amount += (target - R.amount) * Math.min(1, dt * 1.2);
    R.ringMat.opacity = 0.24 + R.amount * 0.6 + Math.sin(time * 3) * 0.04;
    R.ring.rotation.z = time * 0.03;
    R.core.material.opacity = R.amount * (0.55 + Math.sin(time * 4) * 0.15);
    R.beamMat.opacity = R.amount * 0.10;
    R.light.intensity = R.amount * 3.5;
  }
}
