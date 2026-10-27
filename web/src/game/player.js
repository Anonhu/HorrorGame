import * as THREE from 'three';
import { clamp, damp, dampAngle, rand, TAU } from '../core/rng.js';
import { glowTexture, dotTexture } from '../art/tex.js';

/* ============================================================
   PLAYER — first person walker with a bone lantern.
   No jumping: you are here to survive, not to parkour.
   ============================================================ */
export class Player {
  constructor(camera, scene, colliders, fx) {
    this.camera = camera;
    this.scene = scene;
    this.colliders = colliders;
    this.fx = fx;

    this.pos = new THREE.Vector3(0, 0, 4.5);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;      // looking toward -z
    this.pitch = -0.05;
    this.height = 1.68;
    this.crouch = 0;
    this.bobT = 0;
    this.bobAmp = 0;
    this.roll = 0;
    this.lanternOn = true;
    this.dead = false;
    this.speed = 0;
    this.moveInput = { x: 0, z: 0 };
    this.sprinting = false;
    this.crouching = false;
    this.stamina = 1;
    this.stepCounter = 0;
    this.onStep = null;
    this.shake = 0;
    this.damageTilt = 0;

    this._buildLantern();
    camera.position.set(this.pos.x, this.height, this.pos.z);
    camera.rotation.order = 'YXZ';
  }

  _buildLantern() {
    const g = new THREE.Group();

    // handle
    const metal = new THREE.MeshStandardMaterial({
      color: 0x3b3126, roughness: 0.6, metalness: 0.45, emissive: 0x120b05, emissiveIntensity: 0.6,
    });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 4, 10, Math.PI), metal);
    handle.rotation.x = Math.PI / 2;
    handle.position.y = 0.1;
    g.add(handle);

    // cage
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.14, 6, 1, true), metal);
    g.add(cage);
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.05, 6), metal);
    top.position.y = 0.095;
    g.add(top);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.03, 6), metal);
    bottom.position.y = -0.083;
    g.add(bottom);

    // glass glow
    const glass = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('#fffbe8', '#ffc46a', 'rgba(255,90,20,0)'),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glass.scale.setScalar(0.44);
    g.add(glass);
    this.glass = glass;

    // flame core
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffdca0 })
    );
    g.add(core);
    this.core = core;

    // light
    this.light = new THREE.PointLight(0xffb066, 5.2, 22, 2);
    this.light.position.y = 0.02;
    g.add(this.light);

    // hang it in the lower-right of the view
    g.position.set(0.36, -0.33, -0.62);
    g.rotation.set(0.15, -0.28, 0.12);
    this.camera.add(g);
    this.lantern = g;

    // a second, wider "hand glow" for readability in the dark
    this.rim = new THREE.PointLight(0xff9a4a, 0.6, 6, 2);
    this.rim.position.set(0, -0.1, 0.2);
    this.camera.add(this.rim);
    this.scene.add(this.camera);
  }

  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    return out.normalize();
  }

  setLantern(on) {
    this.lanternOn = on;
    this.lantern.visible = true;
    this.core.visible = on;
    this.glass.visible = on;
    this.light.intensity = on ? 5.2 : 0;
    this.rim.intensity = on ? 0.6 : 0.12;
  }

  addShake(v) { this.shake = Math.min(1.4, this.shake + v); }

  /**
   * @returns {{speed:number, sprinting:boolean, crouching:boolean, moved:number, noise:number}}
   */
  update(dt, input, time) {
    if (this.dead) {
      this._deathUpdate(dt, time);
      return { speed: 0, sprinting: false, crouching: true, moved: 0, noise: 0 };
    }

    const look = input.readLook();
    this.yaw = (this.yaw + look.yaw) % TAU;
    this.pitch = clamp(this.pitch + look.pitch, -1.35, 1.25);

    const ax = input.axis();
    this.moveInput.x = ax.x;
    this.moveInput.z = ax.z;
    const wantCrouch = input.crouch;
    const wantSprint = input.sprint && !wantCrouch && (ax.x || ax.z);

    // stamina keeps sprint from being the default answer
    if (wantSprint && this.stamina > 0.08) {
      this.sprinting = true;
      this.stamina = clamp(this.stamina - dt * 0.16, 0, 1);
    } else {
      this.sprinting = false;
      this.stamina = clamp(this.stamina + dt * (wantCrouch ? 0.2 : 0.11), 0, 1);
    }
    this.crouching = wantCrouch;

    this.crouch = damp(this.crouch, wantCrouch ? 1 : 0, 9, dt);

    const maxSpeed = this.sprinting ? 5.5 : this.crouching ? 1.35 : 3.15;
    const accel = this.crouching ? 12 : this.sprinting ? 9 : 11;

    // camera-relative movement
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wishX = ax.x * cos - ax.z * sin;
    const wishZ = -ax.x * sin - ax.z * cos;
    const target = new THREE.Vector3(wishX, 0, wishZ);
    if (target.lengthSq() > 0) target.normalize().multiplyScalar(maxSpeed);
    this.vel.x = damp(this.vel.x, target.x, accel, dt);
    this.vel.z = damp(this.vel.z, target.z, accel, dt);

    const prev = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // collisions (trunks, stones, camps)
    this.colliders.resolve(this.pos, 0.42);

    // keep inside the grove
    const r = Math.hypot(this.pos.x, this.pos.z);
    const maxR = 101;
    if (r > maxR) {
      this.pos.x = (this.pos.x / r) * maxR;
      this.pos.z = (this.pos.z / r) * maxR;
    }

    const moved = Math.hypot(this.pos.x - prev.x, this.pos.z - prev.z) / Math.max(dt, 1e-4);
    this.speed = damp(this.speed, moved, 8, dt);

    // head bob & lantern sway
    this.bobT += dt * (this.sprinting ? 12.5 : this.crouching ? 5.5 : 8.4) * clamp(this.speed / 3, 0, 1.6);
    const bobTarget = clamp(this.speed / 3.2, 0, 1.5) * (this.sprinting ? 1.35 : 1);
    this.bobAmp = damp(this.bobAmp, bobTarget, 6, dt);
    const bobY = Math.sin(this.bobT * 2) * 0.035 * this.bobAmp;
    const bobX = Math.cos(this.bobT) * 0.03 * this.bobAmp;

    this.shake = damp(this.shake, 0, 3.2, dt);
    const shakeX = (Math.random() - 0.5) * this.shake * 0.05;
    const shakeY = (Math.random() - 0.5) * this.shake * 0.05;

    const eye = this.height - this.crouch * 0.62;
    this.camera.position.set(this.pos.x + bobX, eye + bobY + shakeY, this.pos.z);
    this.camera.rotation.set(this.pitch + shakeX, this.yaw, this.roll);

    // lantern follows with lag = weight
    const swing = this.sprinting ? 0.16 : this.crouching ? 0.03 : 0.09;
    this.lantern.position.x = 0.36 + Math.sin(this.bobT) * swing * 0.5;
    this.lantern.position.y = -0.33 + Math.sin(this.bobT * 2 + 0.6) * swing * 0.6;
    this.lantern.rotation.z = 0.12 + Math.sin(this.bobT) * swing * 0.8;
    this.lantern.rotation.x = 0.15 - Math.sin(this.bobT * 2) * swing * 0.4;
    this.lantern.rotation.y = -0.28 + Math.sin(this.bobT * 0.5) * 0.03;

    if (this.lanternOn) {
      const flick = 0.86 + Math.sin(time * 11.3) * 0.07 + Math.sin(time * 24.7) * 0.04 + rand(-0.03, 0.03);
      this.light.intensity = 5.2 * flick;
      this.glass.scale.setScalar(0.42 * (0.9 + flick * 0.15));
      this.glass.material.opacity = 0.85 * flick;
      this.core.scale.setScalar(0.9 + Math.sin(time * 15) * 0.12);
    }

    // footsteps
    this.stepCounter += Math.max(0, moved) * dt;
    const stepLen = this.sprinting ? 2.0 : this.crouching ? 1.3 : 1.7;
    if (this.stepCounter > stepLen) {
      this.stepCounter = 0;
      if (this.onStep) this.onStep(this.pos, this.sprinting, this.crouching);
      if (this.fx && Math.random() < 0.7) this.fx.footstep(this.pos.x, this.pos.z, this.crouching);
    }

    // noise contribution of movement/lantern
    let noise = 0;
    if (this.crouching) noise = 3.0 * clamp(this.speed / 1.4, 0, 1);
    else if (this.sprinting) noise = 34 * clamp(this.speed / 5.5, 0, 1);
    else noise = 12 * clamp(this.speed / 3.2, 0, 1);
    if (this.lanternOn) noise += 3.5;
    if (this.speed < 0.15) noise = this.lanternOn ? 2.5 : 1.2;

    return {
      speed: this.speed,
      sprinting: this.sprinting,
      crouching: this.crouching,
      moved,
      noise,
      stamina: this.stamina,
    };
  }

  hurt(dirX = 0, dirZ = 0) {
    this.addShake(1.1);
    this.vel.x += dirX * 6;
    this.vel.z += dirZ * 6;
    this.damageTilt = 0.25;
  }

  die() {
    this.dead = true;
    this.deathT = 0;
    this.setLantern(true);
    this.light.intensity = 2;
  }

  _deathUpdate(dt, time) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 1.6);
    const e = t * t * (3 - 2 * t);
    this.camera.position.y = (this.height - this.crouch * 0.62) * (1 - e * 0.86);
    this.camera.rotation.z = e * 0.9;
    this.camera.rotation.x = this.pitch + e * 0.5;
    this.lanternOn = true;
    this.light.intensity = (1 - e) * 4 + 0.4;
    this.glass.material.opacity = Math.max(0, 1 - e) * 0.8;
  }

  reset() {
    this.pos.set(0, 0, 4.5);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.dead = false;
    this.deathT = 0;
    this.stamina = 1;
    this.speed = 0;
    this.crouch = 0;
    this.bobT = 0;
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.position.set(0, this.height, 4.5);
    this.setLantern(true);
  }
}
