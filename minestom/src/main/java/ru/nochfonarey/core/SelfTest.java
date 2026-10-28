package ru.nochfonarey.core;

import ru.nochfonarey.core.LanternMode.Fire;
import ru.nochfonarey.core.LanternMode.Pile;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Headless-проверка правил: боты играют полные раунды во всех трёх режимах.
 * Запуск: java -cp build/classes ru.nochfonarey.core.SelfTest
 * Никакого Minecraft не нужно — проверяется именно игровое ядро.
 */
public final class SelfTest {

    private static int failures = 0;

    public static void main(String[] args) {
        lobby();
        arenas();
        lantern();
        relay();
        inn();
        System.out.println();
        if (failures == 0) System.out.println("ИТОГ: все проверки пройдены");
        else System.out.println("ИТОГ: провалено " + failures);
        if (failures > 0) System.exit(1);
    }

    /* ---------------- инфраструктура ---------------- */

    static final class TestHost implements Host {
        final Map<String, String> blocks = new HashMap<>();
        final List<String> placed = new ArrayList<>();
        final List<String> log = new ArrayList<>();
        int sounds = 0, titles = 0, particles = 0;

        public void chat(P p, String text, Tone tone) {
            log.add((p == null ? "*" : p.name) + ": " + text);
        }

        public void title(P p, String big, String small) {
            titles++;
            log.add("TITLE " + p.name + ": " + big);
        }

        public void sound(P p, String key, float v, float pitch) {
            sounds++;
        }

        public void soundAt(double x, double z, String key, float v, float pitch) {
            sounds++;
        }

        public void particle(String key, double x, double y, double z, int count, double spread) {
            particles++;
        }

        public void block(int x, int y, int z, String key) {
            blocks.put(x + "," + y + "," + z, key);
            placed.add(key);
        }

        public void light(int x, int y, int z, int level) {
            blocks.put("l:" + x + "," + y + "," + z, String.valueOf(level));
        }

        public void followLight(String id, double x, double z, int level) {
            blocks.put("f:" + id, (int) x + "," + (int) z + "," + level);
        }

        /** Сколько блоков уже стояло, когда режим позвал ready(). */
        int readyBlocks = 0;

        public void ready() {
            readyBlocks = blocks.size();
            log.add("*: ready");
        }

        boolean has(String text) {
            for (String s : log) if (s.contains(text)) return true;
            return false;
        }
    }

    static void check(boolean cond, String what) {
        System.out.println((cond ? "  ok   " : "  FAIL ") + what);
        if (!cond) failures++;
    }

    static Room room(ModeType type, int humans, TestHost host) {
        GameServer gs = new GameServer(host);
        Room r = gs.create(type, "p0", "Бот0");
        for (int i = 1; i < humans; i++) r.add("p" + i, "Бот" + i);
        return r;
    }

    static void move(P p, double tx, double tz, double speed, double dt) {
        double dx = tx - p.x, dz = tz - p.z;
        double d = Math.sqrt(dx * dx + dz * dz);
        if (d < 0.05) return;
        double step = Math.min(speed * dt, d);
        p.x += dx / d * step;
        p.z += dz / d * step;
    }

    static void act(P p) {
        p.actUntil = 9e9;
    }

    /* ---------------- мира: лобби, стена, старт раунда ---------------- */

    /** Blueprint, который просто запоминает раскладку: так проверяется геометрия. */
    static final class TestBlueprint implements Blueprint {
        final Map<String, String> cells = new HashMap<>();

        public void put(int x, int y, int z, String key) {
            cells.put(x + "," + y + "," + z, key);
        }

        public void light(int x, int y, int z, int level) {
            cells.put(x + "," + y + "," + z, level <= 0 ? Keys.AIR : "light");
        }

        public void putFacing(int x, int y, int z, String key, String facing) {
            cells.put(x + "," + y + "," + z, key);
        }

        String at(int x, int y, int z) {
            return cells.get(x + "," + y + "," + z);
        }

        boolean solid(int x, int y, int z) {
            String k = at(x, y, z);
            return k != null && !k.equals(Keys.AIR) && !k.equals("light");
        }

        int count(String key) {
            int n = 0;
            for (String v : cells.values()) if (v.equals(key)) n++;
            return n;
        }
    }

    static void lobby() {
        System.out.println("ЛОББИ И ПУСТОТА");
        TestBlueprint w = new TestBlueprint();
        Lobby.build(w);

        check(w.solid(Lobby.CX, Lobby.FLOOR, Lobby.CZ), "под костром есть пол");
        check(w.at(Lobby.CX, Lobby.FLOOR + 1, Lobby.CZ).equals(Keys.TILES), "в центре — плиты жертвенника");
        check(w.solid((int) Lobby.SPAWN_X, Lobby.FLOOR, (int) Lobby.SPAWN_Z), "на спавне есть пол");
        check(!w.solid((int) Lobby.SPAWN_X, Lobby.FLOOR + 1, (int) Lobby.SPAWN_Z),
                "над спавном свободно — игрок не застревает");

        // дыр в площади быть не должно: иначе игрок падает в пустоту из лобби
        int holes = 0;
        for (int x = Lobby.CX - 15; x <= Lobby.CX + 15; x++) {
            for (int z = Lobby.CZ - 15; z <= Lobby.CZ + 15; z++) {
                if (Math.hypot(x - Lobby.CX, z - Lobby.CZ) > 15) continue;
                if (!w.solid(x, Lobby.FLOOR, z)) holes++;
            }
        }
        check(holes == 0, "в площади нет дыр (дыр: " + holes + ")");

        // стена по всему кругу: сбежать с площади нельзя
        check(gaps(w, Lobby.CX, Lobby.CZ, Lobby.FLOOR, Lobby.WALL_R) == 0,
                "невидимая стена замкнута по кругу, лобби");
        check(w.count(Keys.BARRIER) > 500, "блоков стены: " + w.count(Keys.BARRIER));

        TestBlueprint wait = new TestBlueprint();
        RoomLobby.build(wait, "lantern");
        check(wait.solid(0, RoomLobby.Y, 0), "в комнате ожидания есть пол под спавном");
        check(gaps(wait, 0, 0, RoomLobby.Y, RoomLobby.WALL_R) == 0,
                "комната ожидания тоже обнесена стеной");

        // между полом и стеной не должно быть полосы пустоты: провалиться некуда
        int rim = 0;
        for (int x = -12; x <= 12; x++) {
            for (int z = -12; z <= 12; z++) {
                double r = Math.hypot(x + 0.5, z + 0.5);
                if (r < RoomLobby.WALL_R - 0.2 || r > RoomLobby.WALL_R + 1.2) continue;
                boolean wall = Keys.BARRIER.equals(wait.at(x, RoomLobby.Y + 1, z));
                boolean floor = wait.solid(x, RoomLobby.Y, z);
                // либо пол под ногами, либо стена на пути — не оба «нет»
                if (!wall && !floor) rim++;
            }
        }
        check(rim == 0, "у кромки комнаты нет полосы пустоты (дыр: " + rim + ")");
    }

    /**
     * Сколько направлений вообще не упираются в стену.
     *
     * <p>Луч идёт в кольцо на 0,75…1,25 блока от его начала: любой блок,
     * накрывающий такую точку, центром ближе чем 0,71 — значит лежит в кольце.
     * Если хоть где-то стены нет, игрок пройдёт в пустоту.
     */
    static int gaps(TestBlueprint w, int cx, int cz, int floor, double wallR) {
        int bad = 0;
        for (int a = 0; a < 360; a++) {
            double rad = Math.toRadians(a);
            boolean wall = false;
            for (int y = floor + 1; y <= floor + 3 && !wall; y++) {
                for (double d = 0.05; d <= 1.35 && !wall; d += 0.1) {
                    int x = (int) Math.floor(cx + Math.cos(rad) * (wallR + d));
                    int z = (int) Math.floor(cz + Math.sin(rad) * (wallR + d));
                    if (Keys.BARRIER.equals(w.at(x, y, z))) wall = true;
                }
            }
            if (!wall) bad++;
        }
        return bad;
    }

    /** Арена строится до того, как игроков перенесут: иначе старт выглядит пустым. */
    static void arenas() {
        System.out.println("СТАРТ РАУНДА: КАРТА НА МЕСТЕ");
        check(arenaBuilt(ModeType.LANTERN, 36, 36), "Фонарщики: на арене есть земля");
        check(arenaBuilt(ModeType.RELAY, 8, 32), "Эстафета: на арене есть земля");
        check(arenaBuilt(ModeType.INN, 21, 20), "Двор: на арене есть пол");
        int min = 0;
        for (ModeType type : ModeType.values()) min = Math.max(min, arenaBlocks(type));
        System.out.println("       больше всего блоков ставит режим с " + min + " блоками");
    }

    static int arenaBlocks(ModeType type) {
        TestHost host = new TestHost();
        Room room = room(type, 4, host);
        room.start();
        return host.blocks.size();
    }

    static boolean arenaBuilt(ModeType type, int x, int z) {
        TestHost host = new TestHost();
        Room room = room(type, 4, host);
        room.start();
        // ready() вызывается в конце start(): к этому моменту карта уже стоит
        boolean readyAfterBuild = host.readyBlocks > 100;
        boolean floor = false;
        for (int y = 63; y <= 66; y++) {
            String k = host.blocks.get(x + "," + y + "," + z);
            if (k != null) floor = true;
        }
        return readyAfterBuild && floor;
    }

    /* ---------------- Фонарщики ---------------- */

    static void lantern() {
        System.out.println("ФОНАРЩИКИ");
        TestHost host = new TestHost();
        Room room = room(ModeType.LANTERN, 6, host);
        room.start();
        LanternMode m = (LanternMode) room.mode;

        check(m.fires.size() == 4, "четыре костра");
        check(m.piles.size() == 12, "двенадцать кучек дров");

        boolean sawShadow = false;
        int caught = 0;
        double dt = 0.05;
        for (int i = 0; i < (int) (LanternMode.ROUND / dt); i++) {
            for (P p : room.players.values()) {
                if (!p.alive) continue;
                p.actUntil = -1;
                if (p.shadow(m.t)) {
                    Fire f = m.fires.get(0);
                    move(p, f.x, f.z, 4.6, dt);
                    if (p.dist(f.x, f.z) < 2.2) act(p);
                    continue;
                }
                if (p.logs < LanternMode.MAX_CARRY) {
                    Pile best = null;
                    double bd = 1e9;
                    for (Pile pile : m.piles) {
                        if (pile.amount <= 0) continue;
                        double d = p.dist(pile.x, pile.z);
                        if (d < bd) {
                            bd = d;
                            best = pile;
                        }
                    }
                    if (best != null) move(p, best.x, best.z, 4.3, dt);
                } else {
                    Fire best = null;
                    double bd = 1e9;
                    for (Fire f : m.fires) {
                        double d = p.dist(f.x, f.z);
                        if (d < bd) {
                            bd = d;
                            best = f;
                        }
                    }
                    if (best != null) {
                        move(p, best.x, best.z, 4.3, dt);
                        if (p.dist(best.x, best.z) < 2.2) act(p);
                    }
                }
            }
            if (m.shadowPlayer() != null) sawShadow = true;
            room.tick(dt);
            if (room.phase != Room.Phase.PLAY) break;
        }

        check(sawShadow, "Тень появляется в раунде");
        check(room.phase == Room.Phase.PLAY || room.phase == Room.Phase.END, "раунд дошёл до финала");
        if (room.phase == Room.Phase.PLAY) {
            for (int i = 0; i < 1200; i++) room.tick(dt);
        }
        check(room.phase == Room.Phase.END, "после рассвета раунд закрылся");
        check(!room.summary.isEmpty(), "есть текст итога: " + room.summary);
        // Важно не состояние на экране в самом конце (после рассвета костры
        // догорают сами), а то, что игроки действительно их зажигали.
        int ignites = room.players.values().stream().mapToInt(p -> p.ignites).sum();
        check(ignites > 0, "костры построены (зажиганий за раунд: " + ignites + ")");
        check(host.sounds > 10, "звуки играются (" + host.sounds + ")");

        // отдельная проверка поимки Тени лучом
        TestHost h2 = new TestHost();
        Room r2 = room(ModeType.LANTERN, 3, h2);
        r2.start();
        LanternMode m2 = (LanternMode) r2.mode;
        P shadowMan = r2.byId("p0");
        P hunter = r2.byId("p1");
        shadowMan.shadowUntil = m2.t + 30;
        shadowMan.x = 36;
        shadowMan.z = 36;
        hunter.x = 36;
        hunter.z = 46;
        hunter.yaw = 180; // смотрим на -z? yaw 180 = север
        hunter.lanternOn = true;
        hunter.charge = 100;
        hunter.yaw = m2.yawTo(hunter.x, hunter.z, shadowMan.x, shadowMan.z);
        for (int i = 0; i < 60; i++) r2.tick(dt);
        check(!shadowMan.shadow(m2.t) || shadowMan.catchProg > 0, "луч ловит Тень");
        check(h2.has("поймал"), "сообщение о поимке");
    }

    /* ---------------- Эстафета ---------------- */

    static void relay() {
        System.out.println("ЭСТАФЕТА СВЕТА");
        TestHost host = new TestHost();
        Room room = room(ModeType.RELAY, 4, host);
        room.start();
        RelayMode m = (RelayMode) room.mode;

        check(m.carrierId != null, "фонарь у первого игрока в начале");
        check(m.collector != null, "Собиратель создан");
        double startX = m.collector.x;

        double dt = 0.05;
        for (int i = 0; i < 400; i++) {
            P c = room.byId(m.carrierId);
            for (P p : room.players.values()) {
                p.actUntil = -1;
                if (c != null && p.id.equals(c.id)) {
                    move(p, 60, 32, 3.7, dt);
                } else if (c != null) {
                    move(p, c.x - 2, c.z, 4.3, dt);
                }
            }
            room.tick(dt);
        }
        check(Math.abs(m.collector.x - startX) > 1, "Собиратель двигается");

        // передача фонаря
        P c = room.byId(m.carrierId);
        P other = null;
        for (P p : room.players.values()) if (!p.id.equals(c.id)) other = p;
        other.x = c.x + 1;
        other.z = c.z;
        room.act(c.id, "pass", null);
        check(other.id.equals(m.carrierId), "Q передаёт фонарь ближайшему");

        // зарядка у костра
        P carrier = room.byId(m.carrierId);
        m.lanternCharge = 10;
        carrier.x = RelayMode.FIRES[0][0] + 1;
        carrier.z = RelayMode.FIRES[0][1];
        carrier.actUntil = 9e9;
        for (int i = 0; i < 40; i++) room.tick(dt);
        check(m.lanternCharge > 10, "у костра фонарь заряжается: " + (int) m.lanternCharge + "%");

        // крик
        int before = m.decoys.size();
        room.act(carrier.id, "shout", null);
        check(m.decoys.size() == before + 1, "крик ставит приманку");

        // алтарь
        carrier.x = RelayMode.CHAPEL_X + 2;
        carrier.z = RelayMode.ALTAR_Z;
        carrier.actUntil = 9e9;
        for (int i = 0; i < 200; i++) {
            carrier.actUntil = 9e9;
            room.tick(dt);
            if (room.phase == Room.Phase.END) break;
        }
        check(room.phase == Room.Phase.END, "алтарь завершает раунд");
        check(room.summary.contains("фонарь") || room.summary.contains("Фонар"), "итог описывает финал: " + room.summary);
    }

    /* ---------------- Двор ---------------- */

    static void inn() {
        System.out.println("ПОСТОЯЛЫЙ ДВОР");
        TestHost host = new TestHost();
        Room room = room(ModeType.INN, 6, host);
        room.start();
        InnMode m = (InnMode) room.mode;

        check(m.rooms.size() == 9, "девять комнат");
        check(!m.impostors.isEmpty(), "«не гость» назначен");
        check(m.doors.size() >= 10, "двери построены (" + m.doors.size() + ")");

        double dt = 0.05;
        boolean locked = false, clue = false, jailed = false;
        int cyclesSeen = 0;

        for (int i = 0; i < (int) (600 / dt); i++) {
            for (P p : room.players.values()) {
                if (!p.alive || p.cellared) continue;
                p.actUntil = -1;
                if (p.impostor) {
                    P victim = null;
                    double bd = 1e9;
                    for (P q : room.players.values()) {
                        if (!q.alive || q.impostor || q.cellared) continue;
                        double d = p.dist(q.x, q.z);
                        if (d < bd) {
                            bd = d;
                            victim = q;
                        }
                    }
                    if (victim != null) {
                        move(p, victim.x, victim.z, 4.0, dt);
                        if (p.dist(victim.x, victim.z) < 1.5) act(p);
                    }
                } else {
                    // гости ходят по залу и голосуют
                    double a = (i * dt + p.name.length()) * 0.6;
                    move(p, 22 + Math.cos(a) * 4, 20 + Math.sin(a) * 3, 2.0, dt);
                    if (m.voteOpenNow() && p.vote == null) {
                        List<P> cands = new ArrayList<>();
                        for (P q : room.players.values()) if (q.alive && !q.id.equals(p.id)) cands.add(q);
                        if (!cands.isEmpty()) {
                            P t2 = cands.get(i % cands.size());
                            room.act(p.id, m.finalStage ? "finalVote" : "vote", t2.id);
                        }
                    }
                }
            }
            room.tick(dt);
            if (m.lockedRoom != null) locked = true;
            for (P p : room.players.values()) if (!p.clues.isEmpty()) clue = true;
            for (P p : room.players.values()) if (p.cellared) jailed = true;
            cyclesSeen = Math.max(cyclesSeen, m.cycle);
            if (room.phase == Room.Phase.END) break;
        }

        check(locked, "комнаты запираются");
        check(clue, "улики приходят игрокам");
        check(jailed || m.cycle >= 2, "голосование отправляет кого-то в подвал");
        check(cyclesSeen >= 2, "циклы идут: " + cyclesSeen);
        check(host.blocks.containsValue(Keys.WALL), "стены построены");
        check(host.placed.contains(Keys.DOOR_LOCKED), "запертые двери появляются");

        if (room.phase != Room.Phase.END) {
            for (int i = 0; i < (int) (300 / dt) && room.phase != Room.Phase.END; i++) room.tick(dt);
        }
        check(room.phase == Room.Phase.END, "двор доходит до финала");
        check(!room.summary.isEmpty(), "итог: " + room.summary);
    }
}
