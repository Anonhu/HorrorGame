import * as THREE from 'three';
import { clamp, damp, rand, TAU, angleDelta } from '../core/rng.js';
import { makeStag } from '../art/models.js';

/* ============================================================
   THE HOLLOW STAG
   Rules that make it feel alive:
   1. It only moves while unobserved.
   2. Staring at it is not free: >GAZE_LIMIT seconds and it lunges.
   3. Noise is the bait. Quiet players are hard to find.
   4. A sonar ping stuns it — that's your only weapon.
   ============================================================ */

export const STAG = {
  GAZE_LIMIT: 3.4,
  GAZE_CONE: Math.cos(0.46),     // ~26°
  SIGHT_NEAR: 62,                // always "seen" within this if in cone
  SIGHT_FAR_DARK: 26,            // with lantern off
  LUNGE_SPEED: 12,
  LUNGE_TIME: 1.15,
  CHARGE_SPEED: 8.6,
  CHARGE_TIME: 4.2,
  ATTACK_RANGE: 2.5,
  STUN_TIME: 5.0,
  AWARE_RANGE: 46,
};

export class Stag {
  constructor(scene, colliders, { visual = true } = {}) {
    this.scene = scene;
    this.colliders = colliders;
    this.pos = new THREE.Vector3(0, 0, -55);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.mode = 'dormant';
    this.timer = 0;
    this.gaze = 0;
    this.awareness = 0;
    this.observed = false;
    this.speed = 0;
    this.walkPhase = 0;
    this.attackCooldown = 0;
    this.damageDealt = false;
    this.stunTime = 0;
    this.visibleToPlayer = false;
    this.distance = 999;
    this.frozenLook = false;
    this.onCall = null;
    this.callTimer = 6;
    this.teleportGrace = 0;
    this.apparitionAlpha = 0;
    this.firstSeen = false;

    if (visual) {
      this.rig = makeStag();
      this.mesh = this.rig.root;
      this.mesh.visible = false;
      scene.add(this.mesh);
      this._applyColor(new THREE.Color(0x241a15));
      this.eyeBaseOpacity = 0.95;
    }
  }

  /* ---------------- lifecycle ---------------- */
  reset() {
    this.mode = 'dormant';
    this.timer = 0;
    this.gaze = 0;
    this.awareness = 0;
    this.attackCooldown = 0;
    this.stunTime = 0;
    this.teleportGrace = 2.5;
    this._reposition(42, 58, false);
    if (this.rig) {
      this.mesh.visible = false;
      this.rig.ring.material.opacity = 0;
    }
  }

  _reposition(minD = 18, maxD = 40, behind = true) {
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = rand(0, TAU);
      const d = rand(minD, maxD);
      const x = clamp(this.playerRef ? this.playerRef.pos.x + Math.cos(a) * d : Math.cos(a) * d, -100, 100);
      const z = clamp(this.playerRef ? this.playerRef.pos.z + Math.sin(a) * d : Math.sin(a) * d, -100, 100);
      if (Math.hypot(x, z) > 99) continue;
      // not inside a trunk
      let bad = false;
      for (const c of this.colliders.near(x, z, 2)) {
        if (Math.hypot(c.x - x, c.z - z) < c.r + 1.0) { bad = true; break; }
      }
      if (bad) continue;
      // prefer spots outside the player's view
      if (behind && this.playerRef) {
        const fx = -Math.sin(this.playerRef.yaw), fz = -Math.cos(this.playerRef.yaw);
        const vx = x - this.playerRef.pos.x, vz = z - this.playerRef.pos.z;
        const dot = (vx * fx + vz * fz) / Math.max(0.001, Math.hypot(vx, vz));
        if (dot > 0.25) continue;
      }
      best = { x, z };
      break;
    }
    if (!best) {
      const a = rand(0, TAU);
      best = { x: Math.cos(a) * 40, z: Math.sin(a) * 40 };
    }
    this.pos.set(best.x, 0, best.z);
    this.vel.set(0, 0, 0);
  }

  /* ---------------- perception ---------------- */
  _updatePerception(player, forward, noise) {
    const dx = this.pos.x - player.pos.x;
    const dz = this.pos.z - player.pos.z;
    this.distance = Math.hypot(dx, dz);

    const sightRange = player.lanternOn ? STAG.SIGHT_NEAR : STAG.SIGHT_FAR_DARK;
    const dot = (dx * forward.x + dz * forward.z) / Math.max(0.0001, this.distance);
    this.observed = this.distance < sightRange && dot > STAG.GAZE_CONE;
    this.visibleToPlayer = this.mesh ? this.mesh.visible : this.mode !== 'dormant';

    // awareness: noise + proximity + being watched
    let target = 0;
    if (this.distance < STAG.AWARE_RANGE) target += (1 - this.distance / STAG.AWARE_RANGE) * 0.5;
    target += clamp(noise / 100, 0, 1) * 0.55;
    if (this.observed) target += 0.18;
    if (this.mode === 'charge' || this.mode === 'lunge') target = 1;
    this.awareness = damp(this.awareness, clamp(target, 0, 1), 0.8, 0.016);
  }

  /* ---------------- steering ---------------- */
  _avoid(dirX, dirZ, step) {
    let ax = dirX, az = dirZ;
    const lookX = this.pos.x + dirX * step * 3.2;
    const lookZ = this.pos.z + dirZ * step * 3.2;
    for (const c of this.colliders.near(lookX, lookZ, 2.6)) {
      const dx = lookX - c.x, dz = lookZ - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r + 1.5) {
        // steer tangentially around the trunk
        const tx = -dz, tz = dx;
        const side = (tx * dirX + tz * dirZ) > 0 ? 1 : -1;
        ax += (tx / Math.max(d, 0.01)) * 1.6 * side;
        az += (tz / Math.max(d, 0.01)) * 1.6 * side;
      }
    }
    const len = Math.hypot(ax, az) || 1;
    return { x: ax / len, z: az / len };
  }

  _moveToward(tx, tz, speed, dt, strafe = 0) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    let dirX = dx / len, dirZ = dz / len;
    if (strafe) {
      const nx = -dirZ, nz = dirX;
      dirX += nx * strafe * 0.6;
      dirZ += nz * strafe * 0.6;
      const l2 = Math.hypot(dirX, dirZ) || 1;
      dirX /= l2; dirZ /= l2;
    }
    const steer = this._avoid(dirX, dirZ, speed * dt);
    this.speed = damp(this.speed, speed, 4, dt);
    this.pos.x += steer.x * this.speed * dt;
    this.pos.z += steer.z * this.speed * dt;
    this.colliders.resolve(this.pos, 0.75);
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 100) { this.pos.x *= 100 / r; this.pos.z *= 100 / r; }

    // face movement
    const targetYaw = Math.atan2(steer.x, steer.z);
    this.yaw += angleDelta(this.yaw, targetYaw) * Math.min(1, dt * 3.2);
    this.walkPhase += dt * (2.5 + speed * 0.9);
  }

  faceThePlayer(player, dt, rate = 3) {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const targetYaw = Math.atan2(dx, dz);
    this.yaw += angleDelta(this.yaw, targetYaw) * Math.min(1, dt * rate);
  }

  /* ---------------- main update ---------------- */
  /**
   * @param {object} ctx {dt,time,player,forward,noise,camera,audio,fx,onDamage,onGazeLimit}
   */
  update(ctx) {
    const { dt, time, player, forward, noise } = ctx;
    this.playerRef = player;
    this.timer += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this._updatePerception(player, forward, noise);

    switch (this.mode) {
      case 'dormant': this._dormant(ctx); break;
      case 'stalk': this._stalk(ctx); break;
      case 'freeze': this._freeze(ctx); break;
      case 'lunge': this._lunge(ctx); break;
      case 'charge': this._charge(ctx); break;
      case 'recover': this._recover(ctx); break;
      case 'stun': this._stun(ctx); break;
      case 'retreat': this._retreat(ctx); break;
      default: this.mode = 'stalk';
    }

    if (this.stunTime > 0 && this.mode !== 'stun') {
      this.stunTime = 0;
    }

    this._animate(dt, time, ctx);
    return {
      mode: this.mode,
      dist: this.distance,
      awareness: this.awareness,
      gaze: this.gaze / STAG.GAZE_LIMIT,
      observed: this.observed,
      frozen: this.mode === 'freeze',
      stunned: this.mode === 'stun',
      danger: this._danger(),
    };
  }

  _danger() {
    if (this.mode === 'dormant') return 0;
    const prox = clamp(1 - this.distance / 55, 0, 1);
    let m = this.mode === 'lunge' || this.mode === 'charge' ? 1 :
      this.mode === 'freeze' ? 0.8 : this.mode === 'stun' ? 0.35 : 0.55;
    return clamp(prox * m + this.awareness * 0.25, 0, 1);
  }

  _wake(reason) {
    if (this.mode !== 'dormant') return;
    this.mode = 'stalk';
    this.timer = 0;
    if (this.mesh) this.mesh.visible = true;
    if (this.onCall) this.onCall('wake', this);
  }

  _dormant(ctx) {
    if (this.timer < this.teleportGrace) return;
    if (this.mesh) this.mesh.visible = false;
    // it fades into the world; wake when the player is loud or close
    if (ctx.noise > 22 || this.distance < 24) {
      this._wake();
    }
    // drift quietly to a new spot far away, only while unobserved
    if (!this.observed && this.distance > 50) {
      this._reposition(28, 46, true);
    }
  }

  _stalk(ctx) {
    const player = ctx.player;
    if (this.mesh) this.mesh.visible = true;

    // staring freezes it
    if (this.observed) {
      this.mode = 'freeze';
      this.gaze = 0;
      this.timer = 0;
      if (this.onCall) this.onCall('freeze', this);
      return;
    }

    const noise = ctx.noise;
    const base = 1.15 + clamp(noise / 100, 0, 1) * 3.1;
    const urgency = this.distance > 34 ? 1.55 : this.distance > 22 ? 1.15 : 1;
    const speed = base * urgency;
    this._moveToward(player.pos.x, player.pos.z, speed, ctx.dt);
    this.faceThePlayer(player, ctx.dt, 2.6);

    // too loud, too close → charge
    if (this.distance < 26 && noise > 62 && this.attackCooldown <= 0) {
      this.mode = 'charge';
      this.timer = 0;
      this.damageDealt = false;
      if (this.onCall) this.onCall('charge', this);
      return;
    }

    // it loses interest if the player is perfectly quiet and far
    if (noise < 4 && this.distance > 40) {
      this.mode = 'dormant';
      this.timer = 0;
      this.teleportGrace = 1.5;
    }
  }

  _freeze(ctx) {
    const player = ctx.player;
    this.speed = damp(this.speed, 0, 10, ctx.dt);
    this.faceThePlayer(player, ctx.dt, 4.5);

    if (!this.observed) {
      this.gaze = 0;
      this.mode = 'stalk';
      this.timer = 0;
      if (this.onCall) this.onCall('release', this);
      return;
    }

    this.gaze += ctx.dt;
    if (this.gaze > STAG.GAZE_LIMIT * 0.66 && !this.warned) {
      this.warned = true;
      if (this.onCall) this.onCall('warn', this);
    }
    if (this.gaze > STAG.GAZE_LIMIT) {
      this.warned = false;
      this.gaze = 0;
      if (this.onCall) this.onCall('gaze_limit', this);
      if (this.distance < 12) {
        this.mode = 'lunge';
        this.timer = 0;
        this.damageDealt = false;
        if (this.onCall) this.onCall('lunge', this);
      } else {
        this.mode = 'charge';
        this.timer = 0;
        this.damageDealt = false;
        if (this.onCall) this.onCall('charge', this);
      }
    }
  }

  _lunge(ctx) {
    const player = ctx.player;
    this.faceThePlayer(player, ctx.dt, 8);
    if (this.timer < STAG.LUNGE_TIME) {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.speed = damp(this.speed, STAG.LUNGE_SPEED, 6, ctx.dt);
      this.pos.x += (dx / len) * this.speed * ctx.dt;
      this.pos.z += (dz / len) * this.speed * ctx.dt;
      this.colliders.resolve(this.pos, 0.6);
      this.walkPhase += ctx.dt * 14;
      if (this.distance < STAG.ATTACK_RANGE && !this.damageDealt) {
        this.damageDealt = true;
        if (ctx.onDamage) ctx.onDamage(this, 1);
        this.mode = 'retreat';
        this.timer = 0;
        this.attackCooldown = 15;
      }
    } else {
      this.mode = 'recover';
      this.timer = 0;
    }
  }

  _charge(ctx) {
    const player = ctx.player;
    this.faceThePlayer(player, ctx.dt, 6);
    if (this.timer < STAG.CHARGE_TIME) {
      const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.speed = damp(this.speed, STAG.CHARGE_SPEED, 4, ctx.dt);
      const steer = this._avoid(dx / len, dz / len, this.speed * ctx.dt);
      this.pos.x += steer.x * this.speed * ctx.dt;
      this.pos.z += steer.z * this.speed * ctx.dt;
      this.colliders.resolve(this.pos, 0.7);
      this.walkPhase += ctx.dt * 9;
      if (this.distance < STAG.ATTACK_RANGE && !this.damageDealt) {
        this.damageDealt = true;
        if (ctx.onDamage) ctx.onDamage(this, 1);
        this.mode = 'retreat';
        this.timer = 0;
        this.attackCooldown = 16;
      }
    } else {
      this.mode = 'recover';
      this.timer = 0;
    }
  }

  _recover(ctx) {
    this.speed = damp(this.speed, 0, 6, ctx.dt);
    this.faceThePlayer(ctx.player, ctx.dt, 2.5);
    if (this.timer > 1.8) {
      this.mode = 'retreat';
      this.timer = 0;
    }
  }

  _retreat(ctx) {
    const player = ctx.player;
    const dx = this.pos.x - player.pos.x, dz = this.pos.z - player.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    this._moveToward(
      this.pos.x + (dx / len) * 10,
      this.pos.z + (dz / len) * 10,
      3.4, ctx.dt
    );
    if (this.timer > 3.2) {
      this.mode = 'dormant';
      this.timer = 0;
      this.teleportGrace = 4;
      this.awareness = 0;
      this.gaze = 0;
      this._reposition(30, 48, true);
    }
  }

  _stun(ctx) {
    this.speed = 0;
    this.stunTime -= ctx.dt;
    this.faceThePlayer(ctx.player, ctx.dt, 1.2);
    if (this.stunTime <= 0) {
      this.mode = 'stalk';
      this.timer = 0;
      this.awareness = Math.max(this.awareness, 0.5);
    }
  }

  /** sonar hit: stun if in range */
  pingHit(distance) {
    if (this.mode === 'dormant') {
      // a ping can wake it early, but never stun the unseen dead
      return false;
    }
    if (distance > 44) return false;
    this.mode = 'stun';
    this.stunTime = STAG.STUN_TIME;
    this.timer = 0;
    this.gaze = 0;
    this.speed = 0;
    return true;
  }

  /* ---------------- visuals ---------------- */
  _applyColor(c) {
    if (!this.rig) return;
    this.rig.woodMat.color.copy(c);
  }

  _animate(dt, time, ctx) {
    if (!this.rig) return;
    const r = this.rig;
    const m = this.mesh;
    m.position.set(this.pos.x, 0, this.pos.z);
    m.rotation.y = this.yaw;

    const moving = this.mode === 'stalk' || this.mode === 'charge' || this.mode === 'lunge' || this.mode === 'retreat';
    const frozen = this.mode === 'freeze' || this.mode === 'stun';
    const amp = this.mode === 'charge' || this.mode === 'lunge' ? 0.75 : moving ? 0.42 : 0.05;
    const phase = this.walkPhase;

    for (let i = 0; i < r.legs.length; i++) {
      const leg = r.legs[i];
      const swing = Math.sin(phase * 2.2 + leg.phase) * amp;
      leg.hip.rotation.x = swing;
      leg.knee.rotation.x = Math.max(0, Math.cos(phase * 2.2 + leg.phase)) * amp * 1.3;
    }

    // body breathing / hunch
    const breathe = Math.sin(time * (frozen ? 0.9 : 1.9)) * (frozen ? 0.008 : 0.02);
    r.rig.position.y = breathe + (moving ? Math.abs(Math.sin(phase * 2.2)) * 0.06 : 0);
    r.torso.rotation.z = (this.mode === 'charge' || this.mode === 'lunge') ? -0.12 : 0;
    r.torso.rotation.x = frozen ? 0.03 : Math.sin(phase * 1.1) * 0.03;

    // head tracks the player when frozen (the worst part)
    r.head.rotation.y = frozen ? Math.sin(time * 0.6) * 0.04 : Math.sin(phase * 1.1) * 0.08;
    r.head.rotation.x = this.mode === 'lunge' ? -0.35 : frozen ? 0.06 : 0;
    r.neckPivot.rotation.y = frozen ? 0.0 : Math.sin(phase * 0.9) * 0.06;

    // core + eyes
    const alive = this.mode !== 'stun';
    const corePulse = 0.5 + 0.5 * Math.sin(time * (this.mode === 'charge' ? 12 : 2.4));
    if (this.mode === 'stun') {
      r.coreMat.color.setHex(0x8ff8e8);
      r.coreGlow.material.color.setHex(0x9ffff0);
      r.eyes.forEach((e) => { e.material.color.setHex(0xd8fffa); e.material.opacity = 0.95; });
      r.woodMat.emissive.setHex(0x0a2a28);
      r.boneMat.color.setHex(0xbfe9e2);
      r.ring.material.color.setHex(0x6fe3d6);
      r.ring.material.opacity = 0.55 + Math.sin(time * 4) * 0.2;
      r.ring.rotation.z = time * 0.6;
    } else {
      r.coreMat.color.setHex(0xff7a2e);
      r.coreGlow.material.color.setHex(0xff8a30);
      r.coreGlow.material.opacity = 0.55 + corePulse * 0.35;
      r.eyes.forEach((e) => { e.material.color.setHex(0xffffff); e.material.opacity = 0.85 + corePulse * 0.15; });
      r.boneMat.color.setHex(frozen ? 0xd8cdb6 : 0xbfb29a);
      r.woodMat.emissive.setHex(frozen ? 0x1a1208 : 0x120a06);
      r.ring.material.color.setHex(0x6fe3d6);
      r.ring.material.opacity = damp(r.ring.material.opacity, frozen ? 0.30 : 0.0, 3, dt);
      r.ring.rotation.z = time * 0.2;
      if (!alive) r.coreMat.color.setHex(0x8ff8e8);
    }
    r.core.scale.setScalar(0.9 + corePulse * 0.14);

    // tattered strips
    r.torso.children.forEach((child) => {
      if (child.userData.phase !== undefined) {
        child.rotation.x = Math.sin(time * 1.6 + child.userData.phase) * 0.12;
        child.rotation.z = Math.sin(time * 1.1 + child.userData.phase) * 0.08;
      }
    });

    // opacity of the whole apparition (dormant → hidden)
    if (this.mode === 'dormant') {
      m.visible = false;
    } else if (!m.visible) {
      m.visible = true;
    }

    // the ring fades when it retreats far away
    if (this.distance > 55) r.ring.material.opacity *= 0.5;
  }

  /* for the echo shader: a silhouette copy */
  get worldPos() { return this.pos; }
}
