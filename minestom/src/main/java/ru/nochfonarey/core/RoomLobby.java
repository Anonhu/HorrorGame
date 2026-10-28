package ru.nochfonarey.core;

/**
 * Комната ожидания (то, что видит игрок между {@code /h create} и {@code /h start}).
 *
 * <p>Раньше здесь была пустая каменная плита: игроки падали на неё из воздуха
 * и ждали старта. Теперь у каждого режима своя площадка в центре (0,0),
 * пол на y=64, ноги на y=65 — ровно та геометрия, что ждёт слой Minecraft
 * ({@code NetHost.Y}).
 *
 * <ul>
 *   <li><b>Фонарщики</b> — поляна в палом лесу: стволы по кругу, крона над
 *       головой, четыре потухших костра;</li>
 *   <li><b>Эстафета</b> — каменная часовня: стены, вода по бокам, синий огонь
 *       на алтаре;</li>
 *   <li><b>Постоялый двор</b> — крыльцо трактира: доски, ковёр, свечи, бочки
 *       и полки.</li>
 * </ul>
 *
 * <p>Вокруг площадки — пустота и невидимая стена {@link Keys#BARRIER}:
 * из комнаты ожидания нельзя уйти пешком никуда.
 */
public final class RoomLobby {

    /** Пол комнаты ожидания: ноги игрока на этом +1. */
    public static final int Y = 64;
    private static final double R = 9.5;
    /** Невидимая стена вокруг площадки. */
    public static final double WALL_R = 9.4;
    public static final double WALL_T = 1.8;
    public static final int WALL_H = 6;

    private RoomLobby() {
    }

    public static void build(Blueprint w, String mode) {
        switch (mode == null ? "lantern" : mode) {
            case "relay" -> relay(w);
            case "inn" -> inn(w);
            default -> lantern(w);
        }
        wall(w);
        for (int i = 0; i < 8; i++) {
            double a = Math.PI * 2 * i / 8 + 0.4;
            int x = (int) Math.round(Math.cos(a) * 7);
            int z = (int) Math.round(Math.sin(a) * 7);
            w.light(x, Y + 4, z, 13);
        }
    }

    /** Невидимая стена по кромке площадки: сплошное кольцо, без диагональных щелей. */
    private static void wall(Blueprint w) {
        for (int i = -14; i <= 14; i++) {
            for (int j = -14; j <= 14; j++) {
                double r = Math.hypot(i + 0.5, j + 0.5);
                if (r < WALL_R || r > WALL_R + WALL_T) continue;
                for (int y = Y + 1; y <= Y + WALL_H; y++) w.put(i, y, j, Keys.BARRIER);
            }
        }
    }

    /* ───────────── Фонарщики ───────────── */

    /** Поляна: кольцо из мшистого камня, четыре костра, свет и редкие стволы. */
    private static void lantern(Blueprint w) {
        for (int i = -11; i <= 11; i++) {
            for (int j = -11; j <= 11; j++) {
                double r = Math.hypot(i + 0.5, j + 0.5);
                if (r > R) continue;
                String floor = r > 7.5 ? Keys.PATH
                        : (Lobby.hash(i, j, 31) > 0.7 ? Keys.DIRT : Keys.GRASS_BLOCK);
                w.put(i, Y, j, floor);
                w.put(i, Y - 1, j, Keys.STONE);
                w.put(i, Y - 2, j, Keys.DIRT);
                for (int y = Y + 1; y <= Y + 7; y++) w.clear(i, y, j);
                // земляное кольцо по кромке: игрок видит, где край
                if (r > R - 1.0) {
                    w.put(i, Y, j, Keys.PATH);
                    w.put(i, Y + 1, j, Keys.MOSSY_BRICK);
                }
            }
        }
        // четыре костра, потухших: «до рассвета далеко»
        for (int i = 0; i < 4; i++) {
            double a = Math.PI / 2 * i + Math.PI / 4;
            int x = (int) Math.round(Math.cos(a) * 5);
            int z = (int) Math.round(Math.sin(a) * 5);
            for (int dx = -1; dx <= 1; dx++) {
                for (int dz = -1; dz <= 1; dz++) {
                    if (dx == 0 && dz == 0) continue;
                    w.put(x + dx, Y + 1, z + dz, Keys.BRICK);
                }
            }
            w.put(x, Y + 1, z, Keys.FIRE_OFF);
            w.light(x, Y + 3, z, 5);
        }
        // стволы-фонари по кольцу: столб, фонарь на цепи, свет
        for (int i = 0; i < 6; i++) {
            double a = Math.PI * 2 * i / 6 + 0.5;
            int x = (int) Math.round(Math.cos(a) * 8.6);
            int z = (int) Math.round(Math.sin(a) * 8.6);
            for (int y = Y + 1; y <= Y + 3; y++) w.put(x, y, z, Keys.LOG_PALE);
            w.put(x, Y + 4, z, Keys.IRON_CHAIN);
            w.put(x, Y + 5, z, Keys.LANTERN);
            w.light(x, Y + 6, z, 12);
            // палая листва у подножия
            w.put(x + 1, Y + 1, z, Keys.LEAVES);
        }
        w.put(0, Y + 1, 6, Keys.FERN);
        w.put(-2, Y + 1, 6, Keys.BUSH);
        w.put(2, Y + 1, 6, Keys.BUSH);
        w.light(0, Y + 6, 0, 14);
        w.put(0, Y + 1, 4, Keys.PATH);
    }

    /* ───────────── Эстафета света ───────────── */

    /** Развалины часовни: низкие стены с проёмами, алтарь с синим огнём, вода. */
    private static void relay(Blueprint w) {
        for (int i = -11; i <= 11; i++) {
            for (int j = -11; j <= 11; j++) {
                double r = Math.hypot(i + 0.5, j + 0.5);
                if (r > R) continue;
                boolean aisle = Math.abs(i) <= 1;
                w.put(i, Y, j, aisle ? Keys.TILES : Keys.BRICK);
                for (int y = Y + 1; y <= Y + 7; y++) w.clear(i, y, j);
                // стена в два блока с проёмами по четырём сторонам
                if (r > R - 1.0) {
                    boolean gap = Math.abs(i) <= 1 || Math.abs(j) <= 1;
                    if (!gap) {
                        w.put(i, Y + 1, j, Lobby.hash(i, j, 33) > 0.6 ? Keys.MOSSY_BRICK : Keys.BRICK);
                        w.put(i, Y + 2, j, Lobby.hash(i, j + 1, 36) > 0.75 ? Keys.MOSSY_BRICK : Keys.BRICK);
                    } else {
                        w.put(i, Y, j, Keys.TILES);
                    }
                }
                // обломки стен повыше — только с юга и по бокам, чтобы алтарь было видно
                double corner = Math.abs(Math.abs(i) - Math.abs(j));
                if (r > R - 2.4 && r < R - 1.0 && corner < 1.4 && j > -4
                        && Lobby.hash(i, j, 37) > 0.3) {
                    w.put(i, Y + 3, j, Lobby.hash(i, j, 38) > 0.5 ? Keys.BRICK : Keys.MOSSY_BRICK);
                }
            }
        }
        // алтарь на возвышении
        for (int i = -2; i <= 2; i++) {
            for (int j = -3; j <= -1; j++) {
                w.put(i, Y + 1, j, Keys.CHAPEL);
                w.put(i, Y + 2, j, Keys.AIR);
            }
        }
        w.put(0, Y + 2, -2, Keys.CHAPEL);
        w.put(0, Y + 3, -2, Keys.SOUL_CAMPFIRE);
        w.light(0, Y + 5, -2, 14);
        w.put(-2, Y + 2, -2, Keys.CANDLE_ON);
        w.put(2, Y + 2, -2, Keys.CANDLE_ON);

        // вода по бокам прохода
        for (int j = -7; j <= 7; j++) {
            for (int i : new int[]{-3, 3}) {
                w.put(i, Y - 1, j, Keys.SAND);
                w.put(i, Y, j, Keys.WATER);
            }
        }
        // низкие колонны с цепями — «свет держится на честном слове»
        for (int j : new int[]{-6, 0, 6}) {
            for (int i : new int[]{-5, 5}) {
                w.put(i, Y + 1, j, Keys.BRICK);
                w.put(i, Y + 2, j, Keys.IRON_CHAIN);
                w.put(i, Y + 3, j, Keys.SOUL_LANTERN);
            }
        }
        w.put(-6, Y + 1, 4, Keys.SCULK_VEIN);
        w.put(6, Y + 1, 4, Keys.SCULK_VEIN);
        w.put(0, Y + 1, 6, Keys.TILES);
    }

    /* ───────────── Постоялый двор ───────────── */

    /** Крыльцо трактира: доски, ковёр, свечи, бочки, столбы и навес над входом. */
    private static void inn(Blueprint w) {
        for (int i = -11; i <= 11; i++) {
            for (int j = -11; j <= 11; j++) {
                double r = Math.hypot(i + 0.5, j + 0.5);
                if (r > R) continue;
                w.put(i, Y, j, Math.abs(i) <= 1 ? Keys.CARPET : Keys.PLANKS_DARK);
                for (int y = Y + 1; y <= Y + 7; y++) w.clear(i, y, j);
                // бревенчатый частокол по кромке, кроме входа (юг)
                boolean entrance = Math.abs(i) <= 2 && j > R - 2.6;
                if (r > R - 0.9 && !entrance) {
                    w.put(i, Y + 1, j, Keys.LOG_DARK);
                    w.put(i, Y + 2, j, Keys.LOG_DARK);
                }
            }
        }
        // стены дома: задняя часть (север) — три блока с окнами
        for (int i = -7; i <= 7; i++) {
            for (int y = Y + 1; y <= Y + 4; y++) {
                boolean window = (i % 4 == 0) && y == Y + 3;
                w.put(i, y, -9, window ? Keys.IRON_BARS : Keys.PLANKS_SPRUCE);
            }
        }
        for (int j = -9; j <= -3; j++) {
            for (int y = Y + 1; y <= Y + 4; y++) {
                w.put(-7, y, j, Keys.PLANKS_SPRUCE);
                w.put(7, y, j, Keys.PLANKS_SPRUCE);
            }
        }
        // навес над входом, а не над всем двором
        for (int i = -3; i <= 3; i++) {
            for (int j = -3; j <= 1; j++) w.put(i, Y + 5, j, Keys.PLANKS_DARK);
        }
        for (int i : new int[]{-3, 3}) {
            w.put(i, Y + 1, 1, Keys.LOG_DARK);
            w.put(i, Y + 2, 1, Keys.LOG_DARK);
            w.put(i, Y + 3, 1, Keys.LOG_DARK);
            w.put(i, Y + 4, 1, Keys.LOG_DARK);
        }
        // стол со свечами и «стойка хозяина»
        for (int i = -2; i <= 2; i++) {
            for (int j = -4; j <= -2; j++) w.put(i, Y + 1, j, Keys.PLANKS_DARK);
        }
        w.put(-1, Y + 2, -3, Keys.CANDLE_ON);
        w.put(1, Y + 2, -3, Keys.CANDLE_ON);
        w.light(0, Y + 4, -3, 14);
        w.put(0, Y + 1, -6, Keys.LODESTONE);
        w.put(-5, Y + 1, -6, Keys.BOOKSHELF);
        w.put(5, Y + 1, -6, Keys.BARREL);
        w.put(-5, Y + 1, 2, Keys.BARREL);
        w.put(5, Y + 1, 2, Keys.HAY);
        w.put(-4, Y + 1, 5, Keys.PUMPKIN);
        w.putFacing(4, Y + 1, 5, Keys.JACK, "north");
        w.light(-4, Y + 3, 5, 10);
    }
}
