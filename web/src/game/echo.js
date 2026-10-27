import * as THREE from 'three';
import { glowTexture, dotTexture, runeRingTexture } from '../art/tex.js';
import { clamp } from '../core/rng.js';

/* ============================================================
   ECHO — the only way to see. A sonar pulse of borrowed light.
   Costs noise; reveals trunks, trail markers, shrines and HIM.
   ============================================================ */
export class Echo {
  constructor(scene, forest, props, stag, colliders) {
    this.scene = scene;
    this.forest = forest;
    this.props = props;
    this.stag = stag;
    this.colliders = colliders;

    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x8ff8e8, transparent: true, opacity: 0, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 64), mat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      ring.visible = false;
      scene.add(ring);
      this.rings.push({ mesh: ring, mat, t: -1, delay: i * 0.12 });
    }

    // ghost trunks
    const geo = new THREE.CylinderGeometry(0.22, 0.42, 9, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7fe8db, wireframe: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ghosts = new THREE.InstancedMesh(geo, mat, 220);
    this.ghosts.frustumCulled = false;
    this.ghosts.visible = false;
    scene.add(this.ghosts);
    this.ghostT = -1;

    // markers above shrines
    this.markers = [];
    const markTex = glowTexture('#ffffff', '#8ff8e8', 'rgba(40,180,170,0)');
    for (const s of props.shrines) {
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: markTex, color: 0x9ff8ec, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      spr.position.set(s.x, 4.2, s.z);
      spr.scale.setScalar(2.4);
      scene.add(spr);
      this.markers.push(spr);
    }

    // the stag's reveal ghost
    this.stagGhost = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#eafffb', '#4fdcc9', 'rgba(20,120,110,0)'),
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.stagGhost.scale.set(4, 7, 1);
    this.stagGhost.visible = false;
    scene.add(this.stagGhost);

    // ritual target marker
    this.ritualMark = new THREE.Sprite(new THREE.SpriteMaterial({
      map: runeRingTexture(99), color: 0xffb066, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.ritualMark.position.set(0, 0.4, 0);
    this.ritualMark.scale.setScalar(9);
    this.ritualMark.rotation.x = -Math.PI / 2;
    this.scene.add(this.ritualMark);

    this.active = 0;
    this.target = null;
  }

  ping(player, target) {
    this.active = 1;
    this.target = target;
    for (const r of this.rings) { r.t = -r.delay; r.mesh.position.set(player.pos.x, 0.08, player.pos.z); }
    this.ghostT = 0;
    this.ghosts.visible = true;
    this.ghosts.position.set(0, 0, 0);

    // fill ghost trunks with nearby colliders
    const list = [];
    for (const c of this.colliders.near(player.pos.x, player.pos.z, 42)) {
      if (c.r < 0.35) continue;
      list.push(c);
      if (list.length >= 220) break;
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    list.forEach((c, i) => {
      v.set(c.x, 4.5, c.z);
      sc.set(1.6 + c.r, 1, 1.6 + c.r);
      m4.compose(v, q, sc);
      this.ghosts.setMatrixAt(i, m4);
    });
    // hide unused instances
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = list.length; i < 220; i++) this.ghosts.setMatrixAt(i, zero);
    this.ghosts.instanceMatrix.needsUpdate = true;

    const stagDist = Math.hypot(this.stag.pos.x - player.pos.x, this.stag.pos.z - player.pos.z);
    const stagHit = this.stag.pingHit(stagDist);
    if (stagHit || (this.stag.mode !== 'dormant' && stagDist < 50)) {
      this.stagGhost.position.set(this.stag.pos.x, 3.2, this.stag.pos.z);
      this.stagGhost.visible = true;
      this.stagGhost.material.opacity = 0.9;
    }

    // way lanterns light up along the trail
    this.forest.revealWayLanterns();
  }

  update(dt, time, player) {
    this.active = Math.max(0, this.active - dt * 0.65);

    for (const r of this.rings) {
      if (r.t < -0.5) { r.mesh.visible = false; continue; }
      r.t += dt;
      if (r.t < 0) { r.mesh.visible = false; continue; }
      r.mesh.visible = true;
      const k = r.t / 1.75;
      if (k > 1) { r.mesh.visible = false; continue; }
      const rad = 1 + k * 46;
      r.mesh.scale.setScalar(rad);
      r.mat.opacity = Math.pow(1 - k, 2.2) * 0.5;
    }

    if (this.ghostT >= 0) {
      this.ghostT += dt;
      const k = clamp(1 - this.ghostT / 1.6, 0, 1);
      this.ghosts.material.opacity = Math.pow(k, 1.6) * 0.32;
      if (k <= 0) { this.ghostT = -1; this.ghosts.visible = false; }
    }

    const mk = clamp(this.active * 1.6, 0, 1);
    this.markers.forEach((m, i) => {
      const lit = this.props.shrines[i].lit;
      m.material.opacity = mk * (lit ? 0.25 : 0.85);
      m.material.color.setHex(lit ? 0x66c7bd : 0x9ff8ec);
      m.position.y = 3.6 + Math.sin(time * 1.5 + i) * 0.25;
      m.scale.setScalar(2.0 + Math.sin(time * 2 + i) * 0.2);
    });

    if (this.ritualMark) {
      const show = this.props.ritual.active ? 0.55 + Math.sin(time * 2) * 0.12 : mk * 0.4;
      this.ritualMark.material.opacity = show;
      this.ritualMark.rotation.z = time * 0.3;
    }

    if (this.stagGhost.visible) {
      this.stagGhost.material.opacity = Math.max(0, this.stagGhost.material.opacity - dt * 0.75);
      this.stagGhost.position.set(this.stag.pos.x, 3.2 + Math.sin(time * 3) * 0.1, this.stag.pos.z);
      if (this.stagGhost.material.opacity <= 0.01) this.stagGhost.visible = false;
    }
  }
}
