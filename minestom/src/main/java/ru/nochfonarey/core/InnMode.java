package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * ПОСТОЯЛЫЙ ДВОР — дом из девяти комнат, пять циклов по 75 секунд:
 * гаснет общая свеча, запирается комната, всем приходит улика, затем голосование.
 * Один из игроков — «не гость».
 * Числа из party/game/modes/inn.js.
 */
public final class InnMode extends Mode {

    public static final int CYCLES = 5;
    public static final double CYCLE_TIME = 75, VOTE_TIME = 18, FINAL_VOTE = 30;
    public static final double TAKE_TIME = 4.0, TAKE_RANGE = 2.2, ALONE = 7.0;
    /** Сколько секунд держать действие у потухшей свечи, чтобы зажечь её. */
    public static final double LIGHT_TIME = 1.4;
    /** Насколько быстро общая свеча восстанавливает личный огонёк гостя. */
    public static final double WARM_RATE = 16;
    public static final int GROUND_Y = 64, CEIL = 4;
    public static final int X0 = 3, Z0 = 3, X1 = 40, Z1 = 34;

    /* ---------------- план дома ---------------- */

    public static final class Rect {
        public final String id, name;
        public final int x, z, w, h;

        Rect(String id, String name, int x, int z, int w, int h) {
            this.id = id;
            this.name = name;
            this.x = x;
            this.z = z;
            this.w = w;
            this.h = h;
        }

        public boolean inside(double px, double pz) {
            return px >= x && px <= x + w && pz >= z && pz <= z + h;
        }

        public int cx() { return x + w / 2; }

        public int cz() { return z + h / 2; }
    }

    /** Проём в стене: две клетки, соединяет комнаты a и b. */
    public static final class Gate {
        public final int x, z;
        public final String a, b;
        public boolean locked = false;

        Gate(int x, int z, String a, String b) {
            this.x = x;
            this.z = z;
            this.a = a;
            this.b = b;
        }

        public boolean touches(String id) {
            return a.equals(id) || b.equals(id);
        }

        public String other(String id) {
            return a.equals(id) ? b : a;
        }
    }

    public static final class Candle {
        public final int x, z;
        public boolean lit = true;

        Candle(int x, int z) {
            this.x = x;
            this.z = z;
        }
    }

    public final List<Rect> rooms = new ArrayList<>();
    public final List<Gate> doors = new ArrayList<>();
    public final List<Candle> candles = new ArrayList<>();

    public int cycle = 0;
    public double cycleT = 0;
    public String stage = "candle";
    public boolean voteOpen = false;
    public double voteDeadline = 0;
    public String lockedRoom = null;
    public final Map<String, String> votes = new HashMap<>();
    public final Map<String, String> finalVotes = new HashMap<>();
    public List<String> impostors = new ArrayList<>();
    public int kills = 0;
    public int killToWin = 2;
    public boolean finalStage = false;
    public final List<double[]> bodies = new ArrayList<>();
    private final Random rnd = new Random();
    public String summaryText = "";
    private boolean darkAnnounced = false;

    public InnMode(Room room) {
        super(room);
    }

    /* ---------------- старт ---------------- */

    @Override
    public void start() {
        definePlan();
        buildHouse();
        placeSpawns();
        planNight(3);

        int n = room.players.size();
        killToWin = Math.max(2, n / 2 - 1);
        List<P> list = new ArrayList<>(room.players.values());
        java.util.Collections.shuffle(list, rnd);
        int howMany = n >= 10 ? 2 : 1;
        impostors = new ArrayList<>();
        for (int i = 0; i < Math.min(howMany, Math.max(1, n - 2)); i++) {
            P p = list.get(i);
            p.impostor = true;
            p.role = "impostor";
            impostors.add(p.id);
            host.title(p, "ТЫ — НЕ ГОСТЬ", "забирай гостей, когда рядом никого");
            host.sound(p, "minecraft:entity.warden.heartbeat", 1.2f, 0.6f);
        }
        chatAll("Дом закрыт до рассвета. Пять циклов, потом — кто не гость.", Tone.DARK);
        chatAll("Двери запираются, свечи гаснут. Держи Shift рядом с человеком, чтобы забрать его.", Tone.INFO);
    }

    private void definePlan() {
        // план пересобирается с нуля: иначе после /h reset комнаты и двери
        // дублируются, и «не гость» бродит по двум одинаковым домам
        rooms.clear();
        doors.clear();
        candles.clear();
        bodies.clear();
        // сетка 3×3, стены по линиям x=3,13,27,40 и z=3,13,25,34
        rooms.add(new Rect("b1", "Спальня 1", 3, 3, 11, 11));
        rooms.add(new Rect("b2", "Спальня 2", 13, 3, 15, 11));
        rooms.add(new Rect("b3", "Спальня 3", 27, 3, 14, 11));
        rooms.add(new Rect("kitchen", "Кухня", 3, 13, 11, 13));
        rooms.add(new Rect("hall", "Общий зал", 13, 13, 15, 13));
        rooms.add(new Rect("store", "Кладовая", 27, 13, 14, 13));
        rooms.add(new Rect("b4", "Спальня 4", 3, 25, 11, 10));
        rooms.add(new Rect("b5", "Спальня 5", 13, 25, 15, 10));
        rooms.add(new Rect("b6", "Спальня 6", 27, 25, 14, 10));

        // вертикальные проёмы (стена x=13 / x=27), две клетки по z
        gates('x', 13, 7, "b1", "b2");
        gates('x', 13, 18, "kitchen", "hall");
        gates('x', 13, 29, "b4", "b5");
        gates('x', 27, 7, "b2", "b3");
        gates('x', 27, 18, "hall", "store");
        gates('x', 27, 29, "b5", "b6");
        // горизонтальные проёмы (стена z=13 / z=25)
        gates('z', 13, 7, "b1", "kitchen");
        gates('z', 13, 20, "b2", "hall");
        gates('z', 13, 33, "b3", "store");
        gates('z', 25, 7, "kitchen", "b4");
        gates('z', 25, 20, "hall", "b5");
        gates('z', 25, 33, "store", "b6");

        candles.add(new Candle(16, 16));
        candles.add(new Candle(26, 16));
        candles.add(new Candle(16, 23));
        candles.add(new Candle(26, 23));
    }

    /** axis: 'x' — проём в вертикальной стене x=at; 'z' — в горизонтальной z=at. */
    private void gates(char axis, int at, int from, String a, String b) {
        for (int i = 0; i < 2; i++) {
            if (axis == 'x') doors.add(new Gate(at, from + i, a, b));
            else doors.add(new Gate(from + i, at, a, b));
        }
    }

    public Rect room(String id) {
        for (Rect r : rooms) if (r.id.equals(id)) return r;
        return null;
    }

    public String roomName(String id) {
        Rect r = room(id);
        return r == null ? id : r.name;
    }

    private boolean isGate(int x, int z) {
        for (Gate g : doors) if (g.x == x && g.z == z) return true;
        return false;
    }

    private void buildHouse() {
        int y = GROUND_Y;

        // сплошной пол всего дома + гравий вокруг
        for (int x = X0 - 2; x <= X1 + 2; x++) {
            for (int z = Z0 - 2; z <= Z1 + 2; z++) {
                boolean inside = x >= X0 && x <= X1 && z >= Z0 && z <= Z1;
                host.block(x, y - 1, z, Keys.STONE);
                if (inside) {
                    String floor = Keys.FLOOR_ROOM;
                    Rect r = roomAt3(x, z);
                    if (r != null) {
                        if (r.id.equals("hall")) floor = Keys.FLOOR_HALL;
                        else if (r.id.equals("cellar")) floor = Keys.FLOOR_CELLAR;
                    }
                    host.block(x, y, z, floor);
                } else {
                    host.block(x, y, z, Keys.PATH);
                }
                for (int h = 1; h <= CEIL + 1; h++) host.block(x, y + h, z, Keys.AIR);
            }
        }

        // внешние стены и потолок
        for (int x = X0; x <= X1; x++) {
            for (int z = Z0; z <= Z1; z++) {
                boolean edge = x == X0 || x == X1 || z == Z0 || z == Z1;
                if (edge) {
                    for (int h = 1; h <= CEIL; h++) host.block(x, y + h, z, Keys.WALL);
                }
                host.block(x, y + CEIL, z, Keys.WALL);
            }
        }

        // внутренние стены: x=13, x=27, z=13, z=25 (проёмы пропускаем)
        for (int x : new int[]{13, 27}) {
            for (int z = Z0 + 1; z < Z1; z++) {
                if (isGate(x, z)) continue;
                for (int h = 1; h <= CEIL; h++) host.block(x, y + h, z, Keys.WALL);
            }
        }
        for (int z : new int[]{13, 25}) {
            for (int x = X0 + 1; x < X1; x++) {
                if (isGate(x, z)) continue;
                for (int h = 1; h <= CEIL; h++) host.block(x, y + h, z, Keys.WALL);
            }
        }

        // проёмы: сверху перемычка, снизу воздух
        for (Gate g : doors) {
            for (int h = 1; h <= CEIL - 1; h++) host.block(g.x, y + h, g.z, Keys.AIR);
        }

        // свечи в зале и подсветка
        for (Candle c : candles) {
            host.block(c.x, y + 1, c.z, Keys.CANDLE_ON);
            host.light(c.x, y + 2, c.z, 13);
        }
        for (int x = X0; x <= X1; x += 8)
            for (int z = Z0; z <= Z1; z += 8) host.light(x, y + 3, z, 5);

        // подвал — запечатанная комната за домом
        for (int x = 42; x <= 46; x++) {
            for (int z = 16; z <= 22; z++) {
                host.block(x, y - 1, z, Keys.STONE);
                host.block(x, y, z, Keys.FLOOR_CELLAR);
                boolean edge = x == 42 || x == 46 || z == 16 || z == 22;
                for (int h = 1; h <= 3; h++) {
                    host.block(x, y + h, z, edge ? Keys.WALL : Keys.AIR);
                    if (!edge) host.block(x, y + h, z, Keys.AIR);
                }
                host.block(x, y + 4, z, Keys.WALL);
            }
        }
        host.light(44, y + 1, 19, 4);

        // стол в зале
        for (int x = 19; x <= 21; x++)
            for (int z = 18; z <= 20; z++)
                host.block(x, y + 1, z, Keys.FLOOR_HALL);
        for (int x = 19; x <= 21; x++)
            for (int z = 18; z <= 20; z++)
                host.block(x, y + 2, z, Keys.ALTAR);
    }

    private Rect roomAt3(int x, int z) {
        for (Rect r : rooms) if (r.inside(x, z)) return r;
        return null;
    }

    private void placeSpawns() {
        int i = 0;
        double[][] spots = {{17.5, 19.5}, {25.5, 18.5}, {17.5, 16.5}, {25.5, 22.5},
                            {21.5, 16.5}, {21.5, 22.5}, {15.5, 21.5}, {26.5, 21.5}};
        for (P p : room.players.values()) {
            double[] s = spots[i % spots.length];
            p.x = s[0];
            p.z = s[1];
            p.roomId = "hall";
            p.yaw = 0;
            i++;
        }
    }

    /* ---------------- тик ---------------- */

    @Override
    public void tick(double dt) {
        t += dt;
        cycleT += dt;

        for (P p : room.players.values()) {
            if (!p.alive) continue;
            Rect r = roomAt(p.x, p.z);
            if (r != null) p.roomId = r.id;
            if (p.cellared) continue;
            p.candle = (int) Math.max(0, p.candle - dt * 0.22);
        }

        nightTick();
        updateCandles(dt);
        updateKills(dt);
        updateCycle();

        if (finalStage && voteOpen && t >= voteDeadline) resolveFinalVote();
        else if (stage.equals("vote") && voteOpen && t >= voteDeadline) resolveCycleVote();
        checkWin();
    }

    public Rect roomAt(double x, double z) {
        for (Rect r : rooms) if (r.inside(x, z)) return r;
        return null;
    }

    /* ---------------- свечи ---------------- */

    public int litCandles() {
        int n = 0;
        for (Candle c : candles) if (c.lit) n++;
        return n;
    }

    /** В доме темно: все общие свечи погасли. */
    public boolean dark() {
        return litCandles() == 0;
    }

    /** Сколько держится «не гость», когда свет в доме погас. */
    public double takeTime() {
        return dark() ? TAKE_TIME * 0.6 : TAKE_TIME;
    }

    public Candle candleNear(P p, double range, boolean unlitOnly) {
        for (Candle c : candles) {
            if (unlitOnly && c.lit) continue;
            if (p.dist(c.x + 0.5, c.z + 0.5) < range) return c;
        }
        return null;
    }

    private void updateCandles(double dt) {
        if (dark() && !darkAnnounced) {
            darkAnnounced = true;
            chatAll("В доме не осталось света. Гости слепнут, «не гость» — нет.", Tone.DARK);
            for (P p : alive()) {
                host.title(p, "ТЕМНОТА", "зажгите свечу: F или Shift");
                host.sound(p, "minecraft:entity.warden.heartbeat", 1.2f, 0.5f);
            }
        } else if (!dark()) {
            darkAnnounced = false;
        }

        for (P p : room.players.values()) {
            if (!p.alive || p.cellared) {
                p.lightProg = 0;
                continue;
            }
            Candle burnt = candleNear(p, 3.0, true);
            Candle lit = candleNear(p, 3.0, false);
            if (burnt != null) {
                // зажигаем общую свечу: держи действие (ПКМ или Shift) рядом с ней
                if (p.acting(t)) {
                    p.lightProg += dt;
                    host.particle("minecraft:flame", burnt.x + 0.5, GROUND_Y + 1.3, burnt.z + 0.5, 2, 0.2);
                    if (p.lightProg >= LIGHT_TIME) {
                        p.lightProg = 0;
                        relight(burnt, p);
                    }
                } else {
                    p.lightProg = Math.max(0, p.lightProg - dt * 2);
                }
                continue;
            }
            p.lightProg = 0;
            if (lit != null) {
                // у живой свечи личный огонёк восстанавливается
                p.candle = (int) Math.min(100, p.candle + WARM_RATE * dt);
            }
        }
    }

    private void relight(Candle c, P by) {
        c.lit = true;
        host.block(c.x, GROUND_Y + 1, c.z, Keys.CANDLE_ON);
        host.light(c.x, GROUND_Y + 2, c.z, 13);
        host.sound(by, "minecraft:item.flintandsteel.use", 1f, 0.9f);
        host.soundAt(c.x, c.z, "minecraft:block.candle.place", 1.2f, 1f);
        chatAll(by.name + " зажёг(ла) свечу. Света: " + litCandles() + "/" + candles.size() + ".", Tone.GOOD);
        by.ignites++;
    }

    @Override
    protected Night.Event[] nightPool() {
        return Night.INN;
    }

    @Override
    protected boolean applyNight(Night.Event e) {
        switch (e.id()) {
            case "cold" -> {
                int n = 0;
                for (P p : room.players.values()) {
                    if (!p.alive || p.impostor) continue;
                    p.candle = Math.max(0, p.candle - 25);
                    n++;
                }
                return n > 0;
            }
            case "creak" -> {
                List<P> guests = new ArrayList<>();
                for (P p : alive()) if (!p.impostor) guests.add(p);
                if (guests.isEmpty()) return false;
                P lucky = guests.get(rnd.nextInt(guests.size()));
                clue(lucky);
                return true;
            }
            case "draft" -> {
                List<Candle> lit = new ArrayList<>();
                for (Candle c : candles) if (c.lit) lit.add(c);
                if (lit.size() <= 1) return false;
                Candle c = lit.get(rnd.nextInt(lit.size()));
                c.lit = false;
                host.block(c.x, GROUND_Y + 1, c.z, Keys.CANDLE_OFF);
                host.light(c.x, GROUND_Y + 2, c.z, 0);
                host.particle("minecraft:smoke", c.x + 0.5, GROUND_Y + 1.2, c.z + 0.5, 12, 0.4);
                chatAll("Сквозняк задул свечу. Света: " + litCandles() + "/" + candles.size() + ".", Tone.WARN);
                return true;
            }
            default -> {
                return false;
            }
        }
    }

    private void updateKills(double dt) {
        for (P p : room.players.values()) {
            if (!p.alive || !p.impostor || !p.acting(t) || p.cellared) {
                if (p != null && !p.acting(t)) p.takeProg = 0;
                continue;
            }
            P victim = null;
            for (P q : alive()) {
                if (q.id.equals(p.id) || q.impostor) continue;
                if (p.dist(q.x, q.z) < TAKE_RANGE) {
                    victim = q;
                    break;
                }
            }
            if (victim == null) {
                p.takeProg = 0;
                continue;
            }
            // в темноте свидетели плохо видят: если у гостя погас личный огонёк
            // или в доме не осталось свечей, спасти может только тот, кто стоит
            // совсем рядом
            double witnessRange = (dark() || victim.candle <= 0) ? ALONE * 0.45 : ALONE;
            boolean witness = false;
            for (P q : alive()) {
                if (q.id.equals(p.id) || q.id.equals(victim.id)) continue;
                if (p.dist(q.x, q.z) < witnessRange) witness = true;
            }
            if (witness) {
                p.takeProg = Math.max(0, p.takeProg - dt);
                chat(p, "Свидетели рядом. В темноте они не помогут.", Tone.WARN);
                continue;
            }
            p.takeProg += dt;
            host.particle("minecraft:crit", victim.x, GROUND_Y + 1, victim.z, 2, 0.3);
            if (p.takeProg >= takeTime()) {
                p.takeProg = 0;
                p.kills++;
                kills++;
                bodies.add(new double[]{victim.x, victim.z});
                host.block((int) victim.x, GROUND_Y + 1, (int) victim.z, Keys.BODY);
                host.soundAt(victim.x, victim.z, "minecraft:entity.warden.attack_impact", 1f, 0.8f);
                kill(victim, "Не гость забрал тебя в темноте");
                chatAll("Тело найдено: " + victim.name + ".", Tone.WARN);
            }
        }
    }

    private void updateCycle() {
        if (finalStage) return;
        if (stage.equals("candle") && cycleT > 12) {
            stage = "lock";
            lockRandomRoom();
        } else if (stage.equals("lock") && cycleT > 24) {
            stage = "clues";
            giveClues();
        } else if (stage.equals("clues") && cycleT > CYCLE_TIME - VOTE_TIME) {
            stage = "vote";
            voteOpen = true;
            voteDeadline = t + VOTE_TIME;
            chatAll("Голосование: кого запереть в подвале?", Tone.WARN);
            for (P p : alive()) host.title(p, "ГОЛОСОВАНИЕ", "кого в подвал?");
        }
    }

    private void lockRandomRoom() {
        List<Rect> pool = new ArrayList<>();
        for (Rect r : rooms) if (!r.id.equals("hall") && !r.id.equals("cellar")) pool.add(r);
        if (pool.isEmpty()) return;
        Rect r = pool.get(rnd.nextInt(pool.size()));
        lockedRoom = r.id;
        for (Gate g : doors) {
            if (g.touches(r.id) && !g.other(r.id).equals("hall")) {
                g.locked = true;
                for (int h = 1; h <= 2; h++) host.block(g.x, GROUND_Y + h, g.z, Keys.DOOR_LOCKED);
            }
        }
        host.soundAt(r.x + r.w / 2.0, r.z + r.h / 2.0, "minecraft:block.iron_door.close", 1.2f, 0.8f);
        chatAll("Заперта комната: «" + r.name + "».", Tone.WARN);
    }

    private void unlockRooms() {
        for (Gate g : doors) {
            if (g.locked) {
                g.locked = false;
                for (int h = 1; h <= 2; h++) host.block(g.x, GROUND_Y + h, g.z, Keys.AIR);
            }
        }
        lockedRoom = null;
    }

    private void giveClues() {
        for (P p : alive()) clue(p);
    }

    /** Одна улика конкретному игроку: иногда правда, иногда слух (так и задумано). */
    private void clue(P p) {
        List<P> alive = alive();
        P other = null;
        if (alive.size() > 1) {
            do {
                other = alive.get(rnd.nextInt(alive.size()));
            } while (other.id.equals(p.id));
        }
        boolean real = rnd.nextDouble() < 0.55 && other != null;
        String text;
        if (real) {
            Rect r = roomAt(other.x, other.z);
            text = other.name + " был(а) в «" + (r == null ? "коридоре" : r.name) + "» в начале цикла.";
        } else {
            Rect r = rooms.get(rnd.nextInt(rooms.size()));
            String[] fake = {
                    "В «" + r.name + "» пахло гарью от чужой свечи.",
                    "Дверь в «" + r.name + "» скрипела, когда кто-то проходил.",
                    "На полу в «" + r.name + "» остался пепел. Свеча гасла не сама.",
                    "Кто-то стоял слишком близко к темноте у «" + r.name + "».",
            };
            text = fake[rnd.nextInt(fake.length)];
        }
        if (p.clues.size() > 12) p.clues.remove(0);
        p.clues.add(text);
        host.chat(p, "Улика: " + text, Tone.INFO);
        host.sound(p, "minecraft:item.book.page_turn", 0.7f, 1f);
    }

    private void resolveCycleVote() {
        voteOpen = false;
        Map<String, Integer> counts = new HashMap<>();
        for (String target : votes.values()) counts.merge(target, 1, Integer::sum);
        String jailedId = null;
        int best = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > best) {
                best = e.getValue();
                jailedId = e.getKey();
            }
        }
        P jailed = jailedId == null ? null : room.byId(jailedId);
        if (jailed != null) {
            jailed.cellared = true;
            jailed.x = 44;
            jailed.z = 19;
            host.title(jailed, "ПОДВАЛ", "тебя заперли на цикл");
            chatAll(jailed.name + " заперт(а) в подвале.", Tone.WARN);
        } else {
            chatAll("Голоса разделились — в подвал никто не попал.", Tone.INFO);
        }
        votes.clear();

        if (cycle >= CYCLES - 1) startFinalVote();
        else beginCycle();
    }

    private void beginCycle() {
        cycle++;
        cycleT = 0;
        stage = "candle";
        unlockRooms();
        for (P p : room.players.values()) {
            p.vote = null;
            if (p.cellared) {
                p.cellared = false;
                p.x = 21.5;
                p.z = 19.5;
                host.chat(p, "Подвал открыт. Ты свободен.", Tone.INFO);
            }
        }
        List<Candle> lit = new ArrayList<>();
        for (Candle c : candles) if (c.lit) lit.add(c);
        if (lit.size() > 1) {
            Candle c = lit.get(rnd.nextInt(lit.size()));
            c.lit = false;
            host.block(c.x, GROUND_Y + 1, c.z, Keys.CANDLE_OFF);
            host.light(c.x, GROUND_Y + 2, c.z, 0);
            chatAll("Одна общая свеча погасла.", Tone.WARN);
        }
    }

    private void startFinalVote() {
        finalStage = true;
        stage = "finalvote";
        voteOpen = true;
        voteDeadline = t + FINAL_VOTE;
        unlockRooms();
        for (P p : room.players.values()) p.vote = null;
        chatAll("Рассвет. Кто из вас — не гость? Голосуйте.", Tone.DARK);
        for (P p : alive()) host.title(p, "ФИНАЛЬНОЕ ГОЛОСОВАНИЕ", "кто не гость?");
    }

    private void resolveFinalVote() {
        voteOpen = false;
        Map<String, Integer> counts = new HashMap<>();
        for (String target : finalVotes.values()) counts.merge(target, 1, Integer::sum);
        String top = null;
        int best = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > best) {
                best = e.getValue();
                top = e.getKey();
            }
        }
        if (top != null && impostors.contains(top)) {
            winner = "guests";
            summaryText = "Гости вычислили «не гостя»: " + name(top) + ".";
            chatAll(summaryText, Tone.GOOD);
        } else {
            winner = "impostor";
            summaryText = "Обвинили не того. «Не гость» дожил до утра: " + impostorNames() + ".";
            chatAll(summaryText, Tone.DARK);
        }
        done = true;
        phase = "result";
    }

    private String name(String id) {
        P p = room.byId(id);
        return p == null ? "?" : p.name;
    }

    private String impostorNames() {
        StringBuilder sb = new StringBuilder();
        for (String id : impostors) {
            P p = room.byId(id);
            if (p != null) sb.append(p.name).append(' ');
        }
        return sb.toString().trim();
    }

    private void checkWin() {
        if (done) return;
        if (kills >= killToWin) {
            winner = "impostor";
            summaryText = "«Не гость» забрал(а) " + kills + " гостей и победил(а).";
            done = true;
            phase = "result";
            chatAll(summaryText, Tone.DARK);
            return;
        }
        List<P> alive = alive();
        if (alive.size() <= 2) {
            boolean guestLeft = false;
            for (P p : alive) if (!p.impostor) guestLeft = true;
            if (!guestLeft) {
                winner = "impostor";
                summaryText = "В доме не осталось гостей.";
            } else {
                winner = "impostor";
                summaryText = "Гостей почти не осталось — рассвет встретил «не гость».";
            }
            done = true;
            phase = "result";
            chatAll(summaryText, Tone.DARK);
        }
    }

    /* ---------------- действия ---------------- */

    @Override
    public void act(P p, String action, String target) {
        if ("use".equals(action) || "shout".equals(action)) {
            useCandle(p);
            return;
        }
        if ("vote".equals(action) && voteOpen && !finalStage) {
            P t2 = room.byId(target);
            if (t2 == null || !t2.alive || t2.id.equals(p.id)) return;
            votes.put(p.id, target);
            p.vote = target;
            chat(p, "Голос за " + t2.name, Tone.INFO);
            host.sound(p, "minecraft:ui.button.click", 0.8f, 1.2f);
        }
        if ("finalVote".equals(action) && voteOpen && finalStage) {
            P t2 = room.byId(target);
            if (t2 == null || !t2.alive || t2.id.equals(p.id)) return;
            finalVotes.put(p.id, target);
            p.vote = target;
            chat(p, "Голос за " + t2.name, Tone.INFO);
            host.sound(p, "minecraft:ui.button.click", 0.8f, 1.2f);
        }
    }

    /**
     * Одиночное действие у свечи (F или ПКМ). Так «свеча работает» даже у того,
     * кто не догадался держать Shift: одно нажатие рядом с потухшей свечой —
     * и она снова горит. У живой свечи действие греет личный огонёк.
     */
    private void useCandle(P p) {
        if (!p.alive || p.cellared) return;
        if (p.useCd > t) {
            chat(p, "Руки заняты — подожди секунду.", Tone.INFO);
            return;
        }
        Candle burnt = candleNear(p, 3.0, true);
        if (burnt != null) {
            p.useCd = t + 1.5;
            p.lightProg = 0;
            relight(burnt, p);
            return;
        }
        Candle lit = candleNear(p, 3.0, false);
        if (lit != null) {
            p.useCd = t + 1.5;
            p.candle = Math.min(100, p.candle + 18);
            host.particle("minecraft:flame", lit.x + 0.5, GROUND_Y + 1.2, lit.z + 0.5, 4, 0.25);
            host.sound(p, "minecraft:block.candle.fizz", 0.6f, 1.3f);
            chat(p, "Огонёк греет: " + (int) p.candle + "%", Tone.INFO);
            return;
        }
        if (p.impostor) {
            p.useCd = t + 1;
            chat(p, "Ты принюхиваешься. Слишком много света.", Tone.DARK);
        }
    }

    @Override
    public String summary() {
        return summaryText.isEmpty() ? "Раунд окончен" : summaryText;
    }

    public int aliveCount() {
        int n = 0;
        for (P p : room.players.values()) if (p.alive) n++;
        return n;
    }

    public boolean nearCandle(P p) {
        for (Candle c : candles) if (p.dist(c.x, c.z) < 3.0) return true;
        return false;
    }

    public boolean voteOpenNow() {
        return voteOpen;
    }

    public Map<String, String> currentVotes() {
        return finalStage ? finalVotes : votes;
    }

    public String stageName() {
        if (finalStage) return "финал";
        switch (stage) {
            case "lock": return "двери";
            case "clues": return "улики";
            case "vote": return "голосование";
            default: return "свечи";
        }
    }

    public static Map<String, String> namesOf(Room room) {
        Map<String, String> m = new LinkedHashMap<>();
        for (P p : room.players.values()) m.put(p.id, p.name);
        return m;
    }
}
