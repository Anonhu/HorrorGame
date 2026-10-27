package ru.leshorror.game;

import net.kyori.adventure.sound.Sound;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.entity.Entity;
import net.minestom.server.entity.EntityType;
import net.minestom.server.entity.Player;
import net.minestom.server.instance.Instance;
import net.minestom.server.network.packet.server.play.ParticlePacket;
import net.minestom.server.particle.Particle;
import net.minestom.server.particle.Particles;

import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;

/**
 * THE HOLLOW STAG.
 *
 * <p>Rules (identical to the browser slice, and to the design doc):
 * <ol>
 *   <li>It only moves while unobserved. Look at it and it freezes.</li>
 *   <li>Staring longer than {@link #GAZE_LIMIT} seconds makes it lunge.</li>
 *   <li>Noise is the bait; a quiet, crouching player is nearly invisible.</li>
 *   <li>An echo ping stuns it — your only weapon.</li>
 * </ol>
 *
 * <p>Movement is manual {@link Entity#teleport(Pos)} so we fully control the
 * "statue" behaviour; no pathfinder AI is involved.
 */
public final class StagHollow {
    public static final double GAZE_LIMIT = 3.4;
    public static final double GAZE_CONE = 0.46;      // radians, half-angle
    public static final double SIGHT_RANGE = 55;
    public static final double ATTACK_RANGE = 2.6;
    public static final double STUN_SECONDS = 5.0;

    private enum Mode { DORMANT, STALK, FREEZE, CHARGE, RETREAT, STUN }

    private final Instance instance;
    private final SessionManager sessions;
    private final Entity entity;
    private final Random rng = new Random(26_3);

    private Mode mode = Mode.DORMANT;
    private final Pos position;
    private double yaw;
    private double timer;
    private double gaze;
    private double stun;
    private double awareness;
    private double attackCooldown;
    private final Map<Player, Boolean> observed = new ConcurrentHashMap<>();

    public StagHollow(Instance instance, SessionManager sessions) {
        this.instance = instance;
        this.sessions = sessions;
        this.position = new Pos(0, 66, -62, 0, 0);
        this.entity = new Entity(EntityType.RAVAGER);
        this.entity.setNoGravity(true);
        this.entity.setInvisible(true);          // we render it with particles + block props
        this.entity.setSilent(true);
    }

    public Entity entity() { return entity; }
    public Pos position() { return position; }
    public boolean dormant() { return mode == Mode.DORMANT; }
    public boolean stunned() { return mode == Mode.STUN; }
    public double awareness() { return awareness; }

    public double distanceTo(Player p) {
        Pos q = p.getPosition();
        return Math.hypot(q.x() - position.x(), q.z() - position.z());
    }

    /** spawn / reset at a spot far from the player */
    public void spawnNear(double px, double pz) {
        double a = rng.nextDouble() * Math.PI * 2;
        double d = 34 + rng.nextDouble() * 18;
        double x = px + Math.cos(a) * d;
        double z = pz + Math.sin(a) * d;
        this.entity.setInstance(instance, new Pos(x, 66, z));
        this.mode = Mode.DORMANT;
        this.timer = 0;
        this.gaze = 0;
        this.awareness = 0;
        this.attackCooldown = 0;
    }

    /** the echo ping: stuns if close enough */
    public boolean pingHit(Player player) {
        if (mode == Mode.DORMANT) return false;
        if (distanceTo(player) > 44) return false;
        mode = Mode.STUN;
        stun = STUN_SECONDS;
        timer = 0;
        gaze = 0;
        entity.setInvisible(false);      // show the glowing statue while stunned
        entity.getViewers().forEach(v -> v.playSound(Sound.sound(
                net.kyori.adventure.key.Key.key("minecraft", "block.amethyst_block.chime"),
                Sound.Source.HOSTILE, 1f, 0.6f), Sound.Emitter.self()));
        return true;
    }

    public void tick() {
        double dt = 0.1;
        tick(dt);
    }

    public void tick(double dt) {
        Session target = sessions.nearestAlive(position.x(), position.z());
        if (target == null) return;
        Player player = target.player();

        timer += dt;
        attackCooldown = Math.max(0, attackCooldown - dt);

        Pos pp = player.getPosition();
        double dx = position.x() - pp.x();
        double dz = position.z() - pp.z();
        double distance = Math.hypot(dx, dz);

        // ---- perception: view cone + range + lantern ----
        double viewX = -Math.sin(Math.toRadians(pp.yaw())) * Math.cos(Math.toRadians(pp.pitch()));
        double viewZ = Math.cos(Math.toRadians(pp.yaw())) * Math.cos(Math.toRadians(pp.pitch()));
        double dot = distance > 0.001 ? (dx * viewX + dz * viewZ) / (-distance) : 1;
        boolean isObserved = distance < SIGHT_RANGE && dot > Math.cos(GAZE_CONE);
        observed.put(player, isObserved);

        double noise = target.noise();
        double targetAwareness = 0;
        if (distance < 46) targetAwareness += (1 - distance / 46) * 0.5;
        targetAwareness += Math.min(1, noise / 100) * 0.55;
        if (isObserved) targetAwareness += 0.18;
        awareness += (Math.min(1, targetAwareness) - awareness) * Math.min(1, dt * 1.5);

        switch (mode) {
            case DORMANT -> {
                if (noise > 22 || distance < 24) wake(player);
                else if (!isObserved && distance > 50) reposition(pp);
            }
            case STALK -> {
                if (isObserved) {
                    mode = Mode.FREEZE;
                    gaze = 0;
                    timer = 0;
                    player.playSound(Sound.sound(
                            net.kyori.adventure.key.Key.key("minecraft", "entity.ravager.stunned"),
                            Sound.Source.HOSTILE, 1.2f, 0.8f), Sound.Emitter.self());
                } else {
                    double speed = (1.1 + Math.min(1, noise / 100) * 3.1) * (distance > 30 ? 1.5 : 1.0);
                    stepToward(pp.x(), pp.z(), speed * dt);
                    faceTo(pp.x(), pp.z(), dt * 2.5);
                    if (distance < 26 && noise > 62 && attackCooldown <= 0) {
                        mode = Mode.CHARGE;
                        timer = 0;
                        callOut(player);
                    }
                    if (noise < 4 && distance > 40) {
                        mode = Mode.DORMANT;
                        timer = 0;
                    }
                }
            }
            case FREEZE -> {
                if (!isObserved) {
                    mode = Mode.STALK;
                    gaze = 0;
                } else {
                    gaze += dt;
                    player.sendActionBar(net.kyori.adventure.text.Component.text(
                            "взгляд: " + String.format("%.1f", Math.max(0, GAZE_LIMIT - gaze)) + "с",
                            net.kyori.adventure.text.format.NamedTextColor.AQUA));
                    if (gaze > GAZE_LIMIT) {
                        gaze = 0;
                        if (distance < 34) {
                            mode = Mode.CHARGE;
                            timer = 0;
                            callOut(player);
                        }
                    }
                }
            }
            case CHARGE -> {
                if (timer < 4.2) {
                    faceTo(pp.x(), pp.z(), dt * 6);
                    stepToward(pp.x(), pp.z(), 8.6 * dt);
                    if (distance < ATTACK_RANGE) {
                        target.damage(1);
                        mode = Mode.RETREAT;
                        timer = 0;
                        attackCooldown = 16;
                    }
                } else {
                    mode = Mode.RETREAT;
                    timer = 0;
                }
            }
            case RETREAT -> {
                stepToward(position.x() * 1.05, position.z() * 1.05, 3.4 * dt);
                if (timer > 3.2) {
                    mode = Mode.DORMANT;
                    timer = 0;
                    reposition(pp);
                }
            }
            case STUN -> {
                stun -= dt;
                particleBurst(player, Particles.SOUL, 6);
                if (stun <= 0) {
                    mode = Mode.STALK;
                    entity.setInvisible(true);
                }
            }
        }

        // ---- the body ----
        entity.teleport(new Pos(position.x(), 66, position.z(), (float) yaw, 0));
        render(player, distance);
    }

    private void wake(Player player) {
        mode = Mode.STALK;
        timer = 0;
        entity.setInvisible(false);
        player.playSound(Sound.sound(
                net.kyori.adventure.key.Key.key("minecraft", "entity.ravager.roar"),
                Sound.Source.HOSTILE, 1.0f, 0.55f), Sound.Emitter.self());
        player.sendMessage(net.kyori.adventure.text.Component.text("…оно проснулось",
                net.kyori.adventure.text.format.NamedTextColor.GRAY,
                net.kyori.adventure.text.format.TextDecoration.ITALIC));
    }

    private void callOut(Player player) {
        player.playSound(Sound.sound(
                net.kyori.adventure.key.Key.key("minecraft", "entity.ravager.ambient"),
                Sound.Source.HOSTILE, 1.4f, 0.5f), Sound.Emitter.self());
        particleBurst(player, Particles.CRIMSON_SPORE, 14);
    }

    private void stepToward(double tx, double tz, double step) {
        double dx = tx - position.x(), dz = tz - position.z();
        double len = Math.hypot(dx, dz);
        if (len < 0.001) return;
        double nx = position.x() + dx / len * step;
        double nz = position.z() + dz / len * step;
        setPos(nx, nz);
        yaw = (float) Math.toDegrees(Math.atan2(dx, dz)) - 180f;
    }

    private void faceTo(double tx, double tz, double k) {
        double target = Math.toDegrees(Math.atan2(tx - position.x(), tz - position.z()));
        double d = ((target - yaw + 540) % 360) - 180;
        yaw += d * Math.min(1, k);
    }

    private void setPos(double x, double z) {
        // keep the thing inside the grove and out of the ritual circle
        double r = Math.hypot(x, z);
        if (r > 100) { x *= 100 / r; z *= 100 / r; }
        this.position = new Pos(x, position.y(), z, position.yaw(), position.pitch());
    }

    private void reposition(Pos playerPos) {
        double a = rng.nextDouble() * Math.PI * 2;
        double d = 30 + rng.nextDouble() * 20;
        double x = playerPos.x() + Math.cos(a) * d;
        double z = playerPos.z() + Math.sin(a) * d;
        setPos(x, z);
    }

    /* ---------------- "rendering": particles + props ---------------- */
    private void render(Player player, double distance) {
        if (distance > 60) return;

        // burning hollow core
        particle(player, Particles.FLAME, position.x(), 66.8, position.z(), 0.35f, 2);
        particle(player, Particles.SOUL, position.x(), 66.5, position.z(), 0.5f, 1);

        // eyes: two red sparks where the head is when it faces you
        double hy = 68.4;
        double hx = position.x() + Math.sin(Math.toRadians(yaw)) * 0.65;
        double hz = position.z() + Math.cos(Math.toRadians(yaw)) * 0.65;
        particle(player, Particles.WITCH, hx, hy, hz, 0.12f, 1);
        particle(player, Particles.WITCH, hx, hy, hz + 0.2, 0.12f, 1);

        // cold aura while frozen, ember trail while charging
        if (mode == Mode.FREEZE) {
            particle(player, Particles.SNOWFLAKE, position.x(), 66.2, position.z(), 0.8f, 3);
            particle(player, Particles.END_ROD, position.x(), 66.1, position.z(), 0.9f, 1);
        } else if (mode == Mode.CHARGE) {
            particle(player, Particles.ASH, position.x(), 66.1, position.z(), 1.2f, 6);
        }
    }

    private void particle(Player player, Particle particle, double x, double y, double z, float spread, int count) {
        player.sendPacket(new ParticlePacket(particle, true, true, x, y, z, spread, 0.1f, spread, 0.02f, count));
    }

    private void particleBurst(Player player, Particle particle, int count) {
        particle(player, particle, position.x(), 66.5, position.z(), 1.4f, count);
    }

    public boolean isObserved(Player p) {
        return observed.getOrDefault(p, false);
    }

    public double gaze(Player p, double dt) {
        return gaze;
    }
}
