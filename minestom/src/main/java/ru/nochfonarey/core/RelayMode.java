package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

/**
 * ЭСТАФЕТА СВЕТА — один фонарь на всех, Собиратель идёт на свет,
 * финал: разбить фонарь у алтаря и остаться в лесу.
 * Числа из party/game/modes/relay.js.
 */
public final class RelayMode extends Mode {

    public static final double ROUND = 720;
    public static final double DRAIN = 0.5, DRAIN_SPRINT = 0.9, RECHARGE = 8;
    public static final double PASS_RANGE = 3.2, SHOUT_COOLDOWN = 15, DECOY_TIME = 4.5;
    public static final double COLLECTOR_SPEED = 2.65, COLLECTOR_CHASE = 3.15, SAFE_FIRE = 6.5;
    public static final double ALTAR_HOLD = 3.0, SMASH_TIME = 7;
    public static final int W = 200, H = 64, GROUND_Y = 64, CHAPEL_X = 182, ALTAR_X = 186, ALTAR_Z = 32;
    public static final double WATER_X0 = 160, WATER_X1 = 172;
    public static final double[][] FIRES = {{52, 32}, {104, 40}, {150, 24}};

    public static final class Decoy {
        final double x, z;
        final double until;

        Decoy(double x, double z, double until) {
            this.x = x;
            this.z = z;
            this.until = until;
        }
    }

    public final List<Decoy> decoys = new ArrayList<>();
    public final Map<String, Double> shoutAt = new HashMap<>();
    public final List<int[]> fireBlocks = new ArrayList<>();

    public String carrierId = null;
    public double lanternCharge = 100;
    public boolean lanternOnGround = false;
    public double lanternX, lanternZ;
    public double smash = 0;
    public boolean smashWarning = false;
    public Mob collector;
    public String sacrifice = null;
    public String reason = null;
    public double altarProg = 0;

    public RelayMode(Room room) {
        super(room);
    }

    @Override
    public void start() {
        buildArena();

        List<P> list = new ArrayList<>(room.players.values());
        for (int i = 0; i < list.size(); i++) {
            P p = list.get(i);
            p.x = 8 + i * 1.4;
            p.z = 32 + (i % 3 - 1) * 1.6;
            p.yaw = 90;
            p.charge = 0;
            p.role = "blind";
        }
        if (!list.isEmpty()) {
            give(list.get(0));
            carrierId = list.get(0).id;
            list.get(0).role = "carrier";
        }
        collector = new Mob("collector", "minecraft:warden", -6, 32);
        mobs.add(collector);

        chatAll("Один фонарь на всех. Донесите его до часовни.", Tone.INFO);
        chatAll("ПКМ — зарядить у костра или разбить у алтаря. Q — передать фонарь. F — крик.", Tone.INFO);
    }

    private void buildArena() {
        int y = GROUND_Y;
        for (int x = 0; x < W; x++) {
            for (int z = 0; z < H; z++) {
                boolean water = x >= WATER_X0 && x < WATER_X1;
                if (water) {
                    host.block(x, y, z, Keys.WATER);
                } else if (x >= 150 && x < WATER_X1) {
                    host.block(x, y, z, Keys.SAND);
                } else {
                    host.block(x, y, z, Keys.GRASS);
                }
                host.block(x, y + 6, z, Keys.AIR);
            }
        }
        // тропа
        for (int x = 4; x < 180; x++) {
            int z = 32 + (int) Math.round(Math.sin(x / 23.0) * 6);
            for (int d = -1; d <= 1; d++) host.block(x, y, z + d, Keys.PATH);
        }
        // часовня
        for (int x = CHAPEL_X; x < CHAPEL_X + 10; x++) {
            for (int z = 26; z < 39; z++) {
                boolean edge = x == CHAPEL_X || x == CHAPEL_X + 9 || z == 26 || z == 38;
                host.block(x, y, z, Keys.STONE);
                if (edge) {
                    for (int h = 1; h <= 4; h++) host.block(x, y + h, z, Keys.CHAPEL);
                } else {
                    for (int h = 1; h <= 4; h++) host.block(x, y + h, z, Keys.AIR);
                }
            }
        }
        // вход в часовню
        for (int z = 31; z <= 33; z++) {
            for (int h = 1; h <= 3; h++) host.block(CHAPEL_X, y + h, z, Keys.AIR);
        }
        // алтарь
        host.block(ALTAR_X, y + 1, ALTAR_Z, Keys.ALTAR);
        host.light(ALTAR_X, y + 2, ALTAR_Z, 12);
        // костры
        for (double[] f : FIRES) {
            int fx = (int) f[0], fz = (int) f[1];
            host.block(fx, y, fz, Keys.STONE);
            host.block(fx, y + 1, fz, Keys.FIRE_ON);
            host.light(fx, y + 2, fz, 14);
            fireBlocks.add(new int[]{fx, y + 1, fz});
        }
        // деревья по краям
        java.util.Random r = new java.util.Random(97);
        for (int i = 0; i < 150; i++) {
            int x = 12 + r.nextInt(W - 30);
            int z = 2 + r.nextInt(H - 4);
            boolean bad = false;
            for (double[] f : FIRES) if (dist(x, z, f[0], f[1]) < 6) bad = true;
            if (x > CHAPEL_X - 4) bad = true;
            if (Math.abs(z - 32) < 5) bad = true;
            if (bad) continue;
            int h = 3 + r.nextInt(3);
            for (int k = 1; k <= h; k++) host.block(x, y + k, z, Keys.TRUNK);
            host.block(x, y + h + 1, z, Keys.LEAVES);
            host.block(x, y + h, z + 1, Keys.LEAVES);
            host.block(x, y + h, z - 1, Keys.LEAVES);
            host.block(x + 1, y + h, z, Keys.LEAVES);
            host.block(x - 1, y + h, z, Keys.LEAVES);
        }
    }

    /* ---------------- тик ---------------- */

    @Override
    public void tick(double dt) {
        t += dt;
        updateCarrier(dt);
        updateLoserLantern(dt);
        updateCollector(dt);
        updateDecoys();

        if (t >= ROUND) finish("time");
        if (alive().isEmpty()) finish("collector");
    }

    public P carrier() {
        return carrierId == null ? null : room.byId(carrierId);
    }

    private void give(P p) {
        for (P q : room.players.values()) {
            q.role = "blind";
            q.charge = 0;
        }
        carrierId = p.id;
        p.role = "carrier";
        lanternOnGround = false;
        smash = 0;
        smashWarning = false;
        host.title(p, "ФОНАРЬ У ТЕБЯ", "Q — передать, ПКМ у костра — зарядить");
        host.sound(p, "minecraft:item.lantern.place", 1f, 1f);
    }

    private void dropLantern(double x, double z) {
        P p = carrier();
        if (p != null) p.role = "blind";
        carrierId = null;
        lanternOnGround = true;
        lanternX = x;
        lanternZ = z;
        lanternCharge = Math.max(0, lanternCharge - 15);
        host.block((int) x, GROUND_Y + 1, (int) z, Keys.SEA_LANTERN);
        host.light((int) x, GROUND_Y + 1, (int) z, 12);
        chatAll("Фонарь на земле! Подберите его.", Tone.WARN);
        host.soundAt(x, z, "minecraft:block.lantern.place", 1.2f, 0.7f);
    }

    private void updateCarrier(double dt) {
        P c = carrier();
        if (c == null || !c.alive) return;

        lanternCharge = Math.max(0, lanternCharge - DRAIN * dt);
        if (lanternCharge <= 0) {
            if (c.charge <= 0) chat(c, "Фонарь погас. Нужен огонь.", Tone.WARN);
            host.followLight("lantern", c.x, c.z, 0);
        } else {
            host.followLight("lantern", c.x, c.z, 13);
        }

        // зарядка у костра
        boolean nearFire = nearFire(c.x, c.z, 4.5);
        if (nearFire && c.acting(t) && lanternCharge < 100) {
            c.chargeProg += dt;
            if (c.chargeProg >= RECHARGE * 0.25) {
                c.chargeProg = 0;
                lanternCharge = Math.min(100, lanternCharge + 25);
                host.sound(c, "minecraft:block.beacon.activate", 0.5f, 1.4f);
                chat(c, "Заряд фонаря: " + (int) lanternCharge + "%", Tone.INFO);
            }
        }

        // алтарь
        if (c.x >= CHAPEL_X) {
            if (c.acting(t)) {
                c.altarProg += dt;
                altarProg = clamp(c.altarProg / ALTAR_HOLD, 0, 1);
                host.particle("minecraft:end_rod", ALTAR_X, GROUND_Y + 1.2, ALTAR_Z, 3, 0.3);
                host.sound(c, "minecraft:block.beacon.ambient", 0.7f, 1.2f);
                if (c.altarProg >= ALTAR_HOLD) {
                    sacrifice = c.id;
                    finish("altar");
                }
            } else {
                c.altarProg = Math.max(0, c.altarProg - dt);
                altarProg = 0;
            }
        }
    }

    private boolean nearFire(double x, double z, double rad) {
        for (double[] f : FIRES) if (dist(x, z, f[0], f[1]) < rad) return true;
        return false;
    }

    private void updateLoserLantern(double dt) {
        if (!lanternOnGround || carrierId != null) return;
        for (P p : alive()) {
            if (p.dist(lanternX, lanternZ) < 1.9) {
                host.block((int) lanternX, GROUND_Y + 1, (int) lanternZ, Keys.AIR);
                host.light((int) lanternX, GROUND_Y + 1, (int) lanternZ, 0);
                lanternOnGround = false;
                give(p);
                chatAll(p.name + " подобрал(а) фонарь.", Tone.GOOD);
                return;
            }
        }
        if (collector != null && !collector.dead && collector.dist(lanternX, lanternZ) < 2.0) {
            smash += dt;
            if (smash > 2 && !smashWarning) {
                smashWarning = true;
                chatAll("Собиратель ломает брошенный фонарь! Верните его!", Tone.WARN);
            }
            if (smash >= SMASH_TIME) finish("collector");
        } else {
            smash = 0;
            smashWarning = false;
        }
    }

    private void updateCollector(double dt) {
        if (collector == null || collector.dead) return;
        if (collector.stunnedUntil > t) return;

        double lx, lz;
        P c = carrier();
        boolean hasLight = c != null && lanternCharge > 0;
        if (hasLight) {
            lx = c.x;
            lz = c.z;
        } else if (lanternOnGround) {
            lx = lanternX;
            lz = lanternZ;
        } else {
            lx = collector.x + 10;
            lz = collector.z;
        }

        double tx = lx, tz = lz;
        double best = Double.MAX_VALUE;
        boolean chase = hasLight;
        for (Decoy d : decoys) {
            double dd = dist(collector.x, collector.z, d.x, d.z);
            if (dd < best && !nearFire(d.x, d.z, SAFE_FIRE)) {
                best = dd;
                tx = d.x;
                tz = d.z;
                chase = false;
            }
        }
        if (nearFire(tx, tz, SAFE_FIRE)) {
            tx = collector.x + 10;
            tz = collector.z;
            chase = false;
        }

        double speed = (chase ? COLLECTOR_CHASE : COLLECTOR_SPEED) * dt;
        double dx = tx - collector.x, dz = tz - collector.z;
        double len = Math.sqrt(dx * dx + dz * dz);
        if (len > 0.05) {
            collector.x += dx / len * speed;
            collector.z += dz / len * speed;
            collector.yaw = yawTo(collector.x, collector.z, tx, tz);
        }
        collector.x = clamp(collector.x, 2, W - 2);
        collector.z = clamp(collector.z, 2, H - 2);
        host.particle("minecraft:soul", collector.x, GROUND_Y + 1.2, collector.z, 2, 0.4);

        if (c != null && c.alive && collector.dist(c.x, c.z) < 1.7) {
            dropLantern(c.x + 0.8, c.z + 0.8);
            c.stunUntil = t + 2.2;
            collector.stunnedUntil = t + 2.0;
            collector.x -= dx / Math.max(0.01, len) * 2.2;
            collector.z -= dz / Math.max(0.01, len) * 2.2;
            host.title(c, "ТЕБЯ СБИЛИ", "фонарь выпал");
            host.sound(c, "minecraft:entity.warden.roar", 0.8f, 1.2f);
        }
    }

    private void updateDecoys() {
        Iterator<Decoy> it = decoys.iterator();
        while (it.hasNext()) {
            Decoy d = it.next();
            if (d.until <= t) {
                host.block((int) d.x, GROUND_Y + 1, (int) d.z, Keys.AIR);
                host.light((int) d.x, GROUND_Y + 2, (int) d.z, 0);
                it.remove();
            }
        }
    }

    /* ---------------- действия ---------------- */

    @Override
    public void act(P p, String action, String target) {
        if ("pass".equals(action)) pass(p);
        if ("shout".equals(action)) shout(p);
    }

    private void pass(P p) {
        if (!p.id.equals(carrierId)) {
            chat(p, "Фонарь не у тебя.", Tone.WARN);
            return;
        }
        P best = null;
        double bd = PASS_RANGE;
        for (P q : alive()) {
            if (q.id.equals(p.id)) continue;
            double d = p.dist(q.x, q.z);
            if (d < bd) {
                bd = d;
                best = q;
            }
        }
        if (best == null) {
            chat(p, "Рядом никого.", Tone.WARN);
            return;
        }
        lanternCharge = clamp(lanternCharge - 2, 0, 100);
        give(best);
        chat(p, "Фонарь передан: " + best.name, Tone.INFO);
        chat(best, "Ты держишь фонарь", Tone.GOOD);
    }

    private void shout(P p) {
        double last = shoutAt.getOrDefault(p.id, -99.0);
        if (t - last < SHOUT_COOLDOWN) {
            chat(p, "Крик ещё не восстановился: " + (int) Math.ceil(SHOUT_COOLDOWN - (t - last)) + " с", Tone.WARN);
            return;
        }
        shoutAt.put(p.id, t);
        decoys.add(new Decoy(p.x, p.z, t + DECOY_TIME));
        host.block((int) p.x, GROUND_Y + 1, (int) p.z, Keys.DECOY);
        host.light((int) p.x, GROUND_Y + 2, (int) p.z, 10);
        host.soundAt(p.x, p.z, "minecraft:entity.warden.sonic_boom", 1f, 1.4f);
        host.particle("minecraft:sonic_boom", p.x, GROUND_Y + 1, p.z, 1, 0);
        chatAll(p.name + " кричит — Собиратель пошёл на звук.", Tone.WARN);
    }

    private void finish(String why) {
        if (done) return;
        done = true;
        reason = why;
        phase = "result";
        if ("altar".equals(why)) {
            winner = "survivors";
            P s = room.byId(sacrifice);
            String name = s == null ? "Кто-то" : s.name;
            if (s != null) {
                s.alive = false;
                s.spectator = true;
            }
            summaryText = name + " разбил(а) фонарь у алтаря и остался в лесу. Остальные вышли к рассвету.";
            chatAll(summaryText, Tone.GOOD);
        } else if ("time".equals(why)) {
            winner = "forest";
            summaryText = "Время вышло: до часовни не дошли.";
            chatAll(summaryText, Tone.DARK);
        } else {
            winner = "forest";
            summaryText = "Фонарь потерян. Собиратель забрал лес.";
            chatAll(summaryText, Tone.DARK);
        }
    }

    private String summaryText = "";

    /* ---------------- подсказки для HUD и слоя Minecraft ---------------- */

    public double collectorDist(P p) {
        return collector == null ? 99 : p.dist(collector.x, collector.z);
    }

    public boolean nearFire(P p) {
        for (int[] f : fireBlocks) if (p.dist(f[0], f[2]) < 3.2) return true;
        return false;
    }

    public boolean nearAltar(P p) {
        return p.dist(ALTAR_X, ALTAR_Z) < 3.4;
    }

    public double shoutLeft(P p) {
        double last = shoutAt.getOrDefault(p.id, -99.0);
        return Math.max(0, SHOUT_COOLDOWN - (t - last));
    }

    @Override
    public String summary() {
        return summaryText;
    }
}
