package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * ФОНАРЩИКИ — 4 костра, дрова, тайная Тень, рассвет и голосование «кто уйдёт по мосту».
 * Числа перенесены из плейтест-версии (party/game/modes/lantern.js).
 */
public final class LanternMode extends Mode {

    public static final double ROUND = 600, VOTE = 30;
    public static final double FEED_TIME = 1.5, FEED_AMOUNT = 35;
    public static final double RECHARGE_TIME = 1.5, RECHARGE_AMOUNT = 40;
    public static final double DRAIN = 0.35, DRAIN_SPRINT = 1.6;
    public static final double SHADOW_EVERY = 60, SHADOW_TIME = 30;
    public static final double DOUSE_TIME = 5, CATCH_TIME = 1.6, CATCH_RANGE = 11, CATCH_ANGLE = 33;
    public static final double STUN_TIME = 4, CARRY_TIME = 8, RESCUE_TIME = 1.2;
    public static final double PILE_RESPAWN = 20;
    public static final int PILE_AMOUNT = 3, MAX_CARRY = 2;

    public static final int GROUND_Y = 64;
    public static final double CX = 36, CZ = 36, RADIUS = 34;

    public static final double[][] FIRES = {{36, 15}, {57, 36}, {36, 57}, {15, 36}};
    public static final double[][] PILES = {
            {36, 24}, {45, 20}, {52, 29}, {44, 41}, {50, 50}, {36, 46},
            {24, 52}, {20, 41}, {27, 30}, {21, 22}, {30, 20}, {42, 32}
    };

    public static final class Fire {
        public final int id;
        public final double x, z;
        public double fuel = 100;
        public boolean lit = true;

        Fire(int id, double x, double z) {
            this.id = id;
            this.x = x;
            this.z = z;
        }
    }

    public static final class Pile {
        public final double x, z;
        public int amount = PILE_AMOUNT;
        public double cool = 0;

        Pile(double x, double z) {
            this.x = x;
            this.z = z;
        }
    }

    public final List<Fire> fires = new ArrayList<>();
    public final List<Pile> piles = new ArrayList<>();
    public final Map<String, String> votes = new HashMap<>();

    public boolean voteOpen = false;
    public double voteDeadline = 0;
    public String lastShadowId = null;
    public double nextShadowAt = SHADOW_EVERY;
    private final Random rnd = new Random();

    public LanternMode(Room room) {
        super(room);
    }

    /* ---------------- старт ---------------- */

    @Override
    public void start() {
        for (int i = 0; i < FIRES.length; i++) fires.add(new Fire(i, FIRES[i][0], FIRES[i][1]));
        for (double[] p : PILES) piles.add(new Pile(p[0], p[1]));

        buildArena();
        placeSpawns();
        for (P p : room.players.values()) {
            p.charge = 100;
            p.lanternOn = true;
        }
        chatAll("Четыре костра. Держите огонь до рассвета.", Tone.INFO);
        chatAll("Дрова подбираются сами — просто пройдите через кучу. У костра держите ПКМ: кормить (с дровами) или заряжать фонарь.", Tone.INFO);
    }

    private void buildArena() {
        int y = GROUND_Y;
        // площадка и круглая граница леса
        for (int x = 0; x < 72; x++) {
            for (int z = 0; z < 72; z++) {
                double d = dist(x + 0.5, z + 0.5, CX, CZ);
                if (d < RADIUS) {
                    host.block(x, y, z, Keys.GRASS);
                    host.block(x, y + 4, z, Keys.AIR);
                } else if (d < RADIUS + 2.5) {
                    host.block(x, y, z, Keys.DIRT);
                    if ((x * 7 + z * 13) % 5 == 0) {
                        host.block(x, y + 1, z, Keys.TRUNK);
                        host.block(x, y + 2, z, Keys.TRUNK);
                        host.block(x, y + 3, z, Keys.LEAVES);
                        host.block(x, y + 4, z, Keys.LEAVES);
                    }
                }
            }
        }
        // лесная подушка из кустов внутри
        for (int i = 0; i < 70; i++) {
            double a = rnd.nextDouble() * Math.PI * 2;
            double r = 6 + rnd.nextDouble() * (RADIUS - 9);
            int x = (int) Math.round(CX + Math.cos(a) * r);
            int z = (int) Math.round(CZ + Math.sin(a) * r);
            if (nearAny(x, z, 3.2)) continue;
            host.block(x, y + 1, z, Keys.BUSH);
        }
        for (Fire f : fires) {
            host.block((int) f.x, y, (int) f.z, Keys.STONE);
            host.block((int) f.x, y + 1, (int) f.z, Keys.FIRE_ON);
            host.light((int) f.x, y + 2, (int) f.z, 14);
        }
        for (Pile p : piles) {
            host.block((int) p.x, y, (int) p.z, Keys.PATH);
            host.block((int) p.x, y + 1, (int) p.z, Keys.LOGS);
        }
    }

    private boolean nearAny(int x, int z, double rad) {
        for (Fire f : fires) if (dist(x, z, f.x, f.z) < rad + 1.5) return true;
        for (double[] p : PILES) if (dist(x, z, p[0], p[1]) < rad) return true;
        return false;
    }

    private void placeSpawns() {
        int i = 0;
        for (P p : room.players.values()) {
            double a = (Math.PI * 2 / Math.max(1, room.players.size())) * i++;
            p.x = CX + Math.cos(a) * 5;
            p.z = CZ + Math.sin(a) * 5;
            p.yaw = yawTo(p.x, p.z, CX, CZ);
        }
    }

    /* ---------------- тик ---------------- */

    @Override
    public void tick(double dt) {
        t += dt;

        updateFires(dt);
        updatePiles(dt);
        updatePlayers(dt);
        updateShadow(dt);
        updateGrabbers(dt);

        if (phase.equals("play") && t >= ROUND) dawn();
        if (voteOpen && t >= voteDeadline) resolveVote();
    }

    private void updateFires(double dt) {
        for (Fire f : fires) {
            if (!f.lit) continue;
            f.fuel -= 0.55 * dt;
            if (f.fuel <= 0) {
                f.fuel = 0;
                f.lit = false;
                host.block((int) f.x, GROUND_Y + 1, (int) f.z, Keys.FIRE_OFF);
                host.light((int) f.x, GROUND_Y + 2, (int) f.z, 0);
                host.soundAt(f.x, f.z, "minecraft:block.fire.extinguish", 1.2f, 0.7f);
                host.particle("minecraft:large_smoke", f.x, GROUND_Y + 1.2, f.z, 20, 0.6);
                chatAll("Костёр погас. Из земли тянутся руки.", Tone.WARN);
                spawnGrabbers(f);
            }
        }
    }

    private void updatePiles(double dt) {
        for (Pile p : piles) {
            if (p.amount <= 0) {
                p.cool -= dt;
                if (p.cool <= 0) {
                    p.amount = PILE_AMOUNT;
                    host.block((int) p.x, GROUND_Y + 1, (int) p.z, Keys.LOGS);
                }
            }
        }
        for (P p : alive()) {
            if (p.logs >= MAX_CARRY || p.held(t)) continue;
            for (Pile pile : piles) {
                if (pile.amount <= 0) continue;
                if (p.dist(pile.x, pile.z) < 1.9) {
                    pile.amount--;
                    p.logs++;
                    if (pile.amount <= 0) {
                        pile.cool = PILE_RESPAWN;
                        host.block((int) pile.x, GROUND_Y + 1, (int) pile.z, Keys.AIR);
                    }
                    host.sound(p, "minecraft:block.wood.place", 0.7f, 1.2f);
                    chat(p, "Дров: " + p.logs + "/" + MAX_CARRY, Tone.INFO);
                    break;
                }
            }
        }
    }

    private Fire nearFire(P p, double range) {
        for (Fire f : fires) if (p.dist(f.x, f.z) < range) return f;
        return null;
    }

    private void updatePlayers(double dt) {
        for (P p : room.players.values()) {
            if (!p.alive) continue;
            if (p.held(t)) continue;

            boolean shadow = p.shadow(t);
            boolean acting = p.acting(t) && !p.stunned(t);
            Fire fire = nearFire(p, 2.6);

            // фонарь
            if (shadow) {
                p.lanternOn = false;
            } else if (p.charge <= 0) {
                p.lanternOn = false;
            }

            // кормить / заряжать
            if (fire != null && acting && !shadow) {
                if (p.logs > 0) {
                    p.feedProg += dt;
                    p.chargeProg = 0;
                    if (p.feedProg >= FEED_TIME) {
                        p.feedProg = 0;
                        p.logs--;
                        if (!fire.lit) {
                            fire.lit = true;
                            fire.fuel = FEED_AMOUNT;
                            host.block((int) fire.x, GROUND_Y + 1, (int) fire.z, Keys.FIRE_ON);
                            host.light((int) fire.x, GROUND_Y + 2, (int) fire.z, 14);
                            host.soundAt(fire.x, fire.z, "minecraft:item.firecharge.use", 1f, 1f);
                            chatAll("Костёр снова горит!", Tone.GOOD);
                            p.ignites++;
                        } else {
                            fire.fuel = Math.min(100, fire.fuel + FEED_AMOUNT);
                            host.soundAt(fire.x, fire.z, "minecraft:block.campfire.crackle", 0.7f, 1f);
                        }
                    }
                } else {
                    p.chargeProg += dt;
                    p.feedProg = 0;
                    if (p.chargeProg >= RECHARGE_TIME) {
                        p.chargeProg = 0;
                        p.charge = Math.min(100, p.charge + RECHARGE_AMOUNT);
                        host.sound(p, "minecraft:block.beacon.activate", 0.4f, 1.6f);
                    }
                }
            } else {
                p.feedProg = Math.max(0, p.feedProg - dt * 2);
                p.chargeProg = Math.max(0, p.chargeProg - dt * 2);
            }

            // расход заряда
            if (p.lanternOn && p.charge > 0) {
                p.charge = Math.max(0, p.charge - DRAIN * dt);
                if (p.charge <= 0) {
                    p.lanternOn = false;
                    chat(p, "Фонарь погас. Зарядите у костра.", Tone.WARN);
                    host.sound(p, "minecraft:block.lantern.break", 0.8f, 1f);
                }
            }

            // прогресс «погасить» для Тени
            if (shadow && fire != null && fire.lit && acting) {
                p.douseProg += dt;
                host.particle("minecraft:smoke", fire.x, GROUND_Y + 1, fire.z, 3, 0.4);
                if (p.douseProg >= DOUSE_TIME) {
                    p.douseProg = 0;
                    fire.fuel = 0;
                    fire.lit = false;
                    host.block((int) fire.x, GROUND_Y + 1, (int) fire.z, Keys.FIRE_OFF);
                    host.light((int) fire.x, GROUND_Y + 2, (int) fire.z, 0);
                    host.soundAt(fire.x, fire.z, "minecraft:block.fire.extinguish", 1.4f, 0.6f);
                    chatAll("Тень погасила костёр.", Tone.DARK);
                    spawnGrabbers(fire);
                    endShadow();
                    return;
                }
            } else {
                p.douseProg = Math.max(0, p.douseProg - dt * 1.5);
            }
        }
    }

    /* ---------------- Тень ---------------- */

    public P shadowPlayer() {
        for (P p : room.players.values()) if (p.shadow(t)) return p;
        return null;
    }

    private void updateShadow(double dt) {
        P s = shadowPlayer();
        if (s == null) {
            if (!voteOpen && phase.equals("play") && t >= nextShadowAt && alive().size() >= 2) {
                startShadow();
            }
            return;
        }
        // ловля лучом
        P catcher = null;
        for (P q : alive()) {
            if (q.id.equals(s.id) || !q.lanternOn || q.charge <= 0) continue;
            if (q.dist(s.x, s.z) > CATCH_RANGE) continue;
            float need = yawTo(q.x, q.z, s.x, s.z);
            if (angleDiff(q.yaw, need) < CATCH_ANGLE) {
                catcher = q;
                break;
            }
        }
        if (catcher != null) {
            s.catchProg += dt;
            if (s.catchProg >= CATCH_TIME) {
                s.stunUntil = t + STUN_TIME;
                catcher.catches++;
                chatAll(catcher.name + " поймал(а) Тень лучом фонаря!", Tone.GOOD);
                host.title(s, "ТЕБЯ ПОЙМАЛИ", "свет держит тебя " + (int) STUN_TIME + " с");
                host.soundAt(s.x, s.z, "minecraft:item.trident.thunder", 1f, 0.8f);
                endShadow();
                return;
            }
        } else {
            s.catchProg = Math.max(0, s.catchProg - dt * 0.7);
        }

        if (t >= s.shadowUntil) {
            endShadow();
            chatAll("Тень вернулась в лес.", Tone.INFO);
        }
    }

    private void startShadow() {
        List<P> pool = new ArrayList<>();
        for (P p : alive()) if (!p.id.equals(lastShadowId)) pool.add(p);
        if (pool.isEmpty()) pool = alive();
        if (pool.isEmpty()) return;
        P victim = pool.get(rnd.nextInt(pool.size()));
        victim.shadowUntil = t + SHADOW_TIME;
        victim.role = "shadow";
        victim.lanternOn = false;
        victim.catchProg = 0;
        victim.douseProg = 0;
        lastShadowId = victim.id;
        nextShadowAt = t + SHADOW_EVERY;
        host.title(victim, "ТЫ — ТЕНЬ", "у тебя " + (int) SHADOW_TIME + " с: погаси костёр");
        host.sound(victim, "minecraft:entity.warden.heartbeat", 1.4f, 0.6f);
        chatAll("Свет кого-то погас. Кто-то среди нас — Тень.", Tone.DARK);
    }

    private void endShadow() {
        P s = shadowPlayer();
        if (s == null) return;
        s.shadowUntil = -1;
        s.role = "keeper";
        s.lanternOn = s.charge > 0;
        s.catchProg = 0;
        s.douseProg = 0;
    }

    /* ---------------- Тянущиеся ---------------- */

    private void spawnGrabbers(Fire f) {
        for (int i = 0; i < 3; i++) {
            double a = rnd.nextDouble() * Math.PI * 2;
            double x = f.x + Math.cos(a) * 3.2;
            double z = f.z + Math.sin(a) * 3.2;
            mobs.add(new Mob("g" + (mobs.size()), "minecraft:husk", x, z));
            host.block((int) x, GROUND_Y, (int) z, Keys.GRABBER);
        }
    }

    private void updateGrabbers(double dt) {
        for (Mob m : mobs) {
            if (m.dead) continue;
            P target = null;
            double best = 22;
            for (P p : alive()) {
                if (p.held(t)) continue;
                double d = p.dist(m.x, m.z);
                if (d < best) {
                    best = d;
                    target = p;
                }
            }
            if (target == null) continue;
            double speed = 2.2 * dt;
            double dx = target.x - m.x, dz = target.z - m.z;
            double len = Math.sqrt(dx * dx + dz * dz);
            if (len > 0.001) {
                m.x += dx / len * speed;
                m.z += dz / len * speed;
                m.yaw = yawTo(m.x, m.z, target.x, target.z);
                m.x = clamp(m.x, 2, 70);
                m.z = clamp(m.z, 2, 70);
            }
            host.particle("minecraft:soul", m.x, GROUND_Y + 0.4, m.z, 1, 0.2);

            // схватил
            for (P p : alive()) {
                if (p.held(t) || p.dist(m.x, m.z) > 1.6) continue;
                p.heldUntil = t + CARRY_TIME;
                host.title(p, "ТЕБЯ ДЕРЖАТ", "напарник может вытащить тебя светом");
                host.sound(p, "minecraft:entity.husk.ambient", 1.2f, 0.6f);
                chatAll(p.name + " попал в руки к Тянущимся!", Tone.WARN);
            }
        }
        // спасение и смерть
        for (P p : room.players.values()) {
            if (!p.alive || !p.held(t)) continue;
            P rescuer = null;
            for (P q : alive()) {
                if (q.id.equals(p.id) || q.dist(p.x, p.z) > 2.6) continue;
                if (q.acting(t) && q.lanternOn) rescuer = q;
            }
            if (rescuer != null) {
                p.rescueProg += dt;
                if (p.rescueProg >= RESCUE_TIME) {
                    p.rescueProg = 0;
                    p.heldUntil = -1;
                    chatAll(rescuer.name + " вытащил(а) " + p.name + " из рук.", Tone.GOOD);
                    host.sound(p, "minecraft:block.beacon.power_select", 1f, 1.4f);
                }
            } else {
                p.rescueProg = 0;
            }
            if (t >= p.heldUntil) {
                p.heldUntil = -1;
                kill(p, "Тянущиеся утащили тебя под землю");
            }
        }
        // Тянущиеся слабеют днём и у горящих костров
        if (!voteOpen && t % 30 < 0.05) {
            for (Mob m : mobs) {
                boolean nearLit = false;
                for (Fire f : fires) if (f.lit && m.dist(f.x, f.z) < 5) nearLit = true;
                if (nearLit) {
                    m.dead = true;
                    host.particle("minecraft:lava", m.x, GROUND_Y + 0.5, m.z, 12, 0.5);
                    host.soundAt(m.x, m.z, "minecraft:entity.zombie.burn", 0.8f, 1.2f);
                }
            }
        }
    }

    /* ---------------- рассвет и голосование ---------------- */

    private void dawn() {
        phase = "vote";
        voteOpen = true;
        voteDeadline = t + VOTE;
        int lit = 0;
        for (Fire f : fires) if (f.lit) lit++;
        if (lit == 0) {
            chatAll("Ни один костёр не дожил до рассвета. Лес забрал всех.", Tone.DARK);
            for (P p : alive()) kill(p, "рассвет не наступил");
            winner = "forest";
            done = true;
            return;
        }
        for (P p : alive()) {
            host.title(p, "РАССВЕТ", "костров дожило: " + lit);
            host.sound(p, "minecraft:block.beacon.activate", 1f, 0.8f);
        }
        chatAll("Рассвет. Голосование: кто уйдёт по мосту? Мест: " + lit, Tone.GOOD);
    }

    @Override
    public void act(P p, String action, String target) {
        if (!"vote".equals(action) || !voteOpen || !p.alive) return;
        if (target == null || target.equals(p.id)) return;
        P t2 = room.byId(target);
        if (t2 == null || !t2.alive) return;
        votes.put(p.id, target);
        p.vote = target;
        chat(p, "Голос за " + t2.name, Tone.INFO);
    }

    private void resolveVote() {
        voteOpen = false;
        int lit = 0;
        for (Fire f : fires) if (f.lit) lit++;
        Map<String, Integer> counts = new HashMap<>();
        for (String target : votes.values()) counts.merge(target, 1, Integer::sum);

        List<P> alive = alive();
        alive.sort((a, b) -> counts.getOrDefault(b.id, 0) - counts.getOrDefault(a.id, 0));
        List<String> winners = new ArrayList<>();
        for (int i = 0; i < alive.size(); i++) {
            if (i < lit) winners.add(alive.get(i).id);
            else kill(alive.get(i), "остался на мосту");
        }
        winner = winners.isEmpty() ? "forest" : "keepers";
        StringBuilder sb = new StringBuilder("Рассвет. Костров: " + lit + ". Ушли: ");
        for (String id : winners) {
            P p = room.byId(id);
            if (p != null) sb.append(p.name).append(' ');
        }
        if (winners.isEmpty()) sb.append("никто");
        summaryText = sb.toString();
        done = true;
        phase = "result";
    }

    private String summaryText = "";

    @Override
    public String summary() {
        return summaryText.isEmpty() ? "Раунд окончен" : summaryText;
    }
}
