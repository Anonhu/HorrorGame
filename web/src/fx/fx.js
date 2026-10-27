import * as THREE from 'three';
import { dotTexture, fogTexture } from '../art/tex.js';
import { rand, TAU } from '../core/rng.js';

/* ============================================================
   FX — pooled particles: floating motes, dust puffs, embers,
   a rising "soul" column when a shrine is lit.
   ============================================================ */

export class FX {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this._motes();
    this._pool();
    this.puffs = [];
  }

  _motes() {
    const N = this.quality === 'low' ? 140 : 380;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rand(-30, 30);
      pos[i * 3 + 1] = rand(0.2, 9);
      pos[i * 3 + 2] = rand(-30, 30);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMap: { value: dotTexture() },
        uColor: { value: new THREE.Color(0xffe3b0) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        uOpacity: { value: 1 },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uPixelRatio;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * 0.22 + aSeed * 40.0) * 2.2;
          p.z += cos(uTime * 0.18 + aSeed * 33.0) * 2.2;
          p.y += sin(uTime * 0.4 + aSeed * 17.0) * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (7.0 + aSeed * 12.0) * uPixelRatio / max(1.0, -mv.z * 0.25);
          vA = smoothstep(80.0, 2.0, -mv.z) * (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 0.8 + aSeed * 60.0)));
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
        varying float vA;
        void main() {
          float a = texture2D(uMap, gl_PointCoord).a;
          gl_FragColor = vec4(uColor, a * vA * 0.5 * uOpacity);
        }`,
    });
    this.motes = new THREE.Points(geo, mat);
    this.motes.frustumCulled = false;
    this.scene.add(this.motes);
  }

  _pool() {
    this.sprites = [];
    const tex = fogTexture();
    this.spriteTex = tex;
    for (let i = 0; i < 60; i++) {
      const m = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0, depthWrite: false,
        color: 0xb9c9c2, blending: THREE.NormalBlending,
      });
      const s = new THREE.Sprite(m);
      s.visible = false;
      s.userData = { life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, size: 1 };
      this.scene.add(s);
      this.sprites.push(s);
    }
  }

  _take() {
    for (const s of this.sprites) if (!s.visible) return s;
    return this.sprites[0];
  }

  puff(x, y, z, { size = 1.2, color = 0x9fb5ac, life = 0.9, up = 0.4, spread = 0.5, opacity = 0.4 } = {}) {
    const s = this._take();
    s.visible = true;
    s.position.set(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2));
    s.material.color.setHex(color);
    s.material.opacity = opacity;
    s.scale.setScalar(size);
    s.userData.life = life;
    s.userData.maxLife = life;
    s.userData.size = size;
    s.userData.baseOpacity = opacity;
    s.userData.vx = rand(-spread, spread);
    s.userData.vy = up * rand(0.5, 1.4);
    s.userData.vz = rand(-spread, spread);
    return s;
  }

  footstep(x, z, crouch = false) {
    this.puff(x + rand(-0.2, 0.2), 0.12, z + rand(-0.2, 0.2), {
      size: crouch ? 0.5 : 0.85,
      color: 0x8fa79c,
      life: 0.7,
      up: crouch ? 0.1 : 0.25,
      spread: 0.25,
      opacity: crouch ? 0.12 : 0.22,
    });
  }

  emberBurst(x, y, z, n = 26, color = 0xffa04a) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(0.4, 3.0);
      const s = this.puff(x, y + rand(0, 0.6), z, {
        size: rand(0.15, 0.5), color, life: rand(0.7, 2.0),
        up: rand(1.0, 3.2), spread: 0.2, opacity: 0.85,
      });
      s.material.blending = THREE.AdditiveBlending;
      s.userData.vx = Math.cos(a) * sp;
      s.userData.vz = Math.sin(a) * sp;
    }
  }

  soulColumn(x, z, n = 40) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const s = this.puff(x + rand(-0.5, 0.5), rand(0.4, 2.4), z + rand(-0.5, 0.5), {
          size: rand(0.4, 1.1), color: 0xffc06a, life: rand(1.4, 3.0),
          up: rand(0.8, 2.4), spread: 0.15, opacity: 0.6,
        });
        s.material.blending = THREE.AdditiveBlending;
      }, i * 55);
    }
  }

  update(dt, time, playerPos) {
    this.motes.material.uniforms.uTime.value = time;
    this.motes.material.uniforms.uOpacity.value = 1;

    // keep the mote field around the player
    const pos = this.motes.geometry.getAttribute('position');
    if (playerPos) {
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - playerPos.x;
        const dz = pos.getZ(i) - playerPos.z;
        if (Math.abs(dx) > 32) pos.setX(i, pos.getX(i) - Math.sign(dx) * 64);
        if (Math.abs(dz) > 32) pos.setZ(i, pos.getZ(i) - Math.sign(dz) * 64);
      }
      pos.needsUpdate = true;
    }

    for (const s of this.sprites) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; continue; }
      s.position.x += u.vx * dt;
      s.position.y += u.vy * dt;
      s.position.z += u.vz * dt;
      u.vy *= 1 - dt * 1.6;
      u.vx *= 1 - dt * 1.2;
      u.vz *= 1 - dt * 1.2;
      const t = u.life / u.maxLife;
      s.material.opacity = u.baseOpacity * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5) * t;
      const grow = 1 + (1 - t) * 1.8;
      s.scale.setScalar(u.size * grow);
    }
  }
}
