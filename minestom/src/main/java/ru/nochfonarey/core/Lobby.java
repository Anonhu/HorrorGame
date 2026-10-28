package ru.nochfonarey.core;

/**
 * Лобби хаба: ночная площадь перед лесом, а не «коробка с полем».
 *
 * <p>Центр — (20, 20), пол на y=63, ноги игрока на y=64. Всё описано ключами
 * {@link Keys}, поэтому раскладку можно поставить в мир
 * ({@code mc.McBlueprint}) или отрисовать без клиента
 * ({@code tools/preview/LobbyPreview.java}).
 *
 * <ul>
 *   <li>круглая площадь из плит с каймой из кирпича и тропинками к воротам;</li>
 *   <li>в центре — жертвенник-костёр на каменном основании и четыре столба
 *       с висящими фонарями;</li>
 *   <li>три арки-входа в режимы: Фонарщики (север), Эстафета (юго-восток),
 *       Двор (юго-запад), у каждой своя подсветка и свои вещи;</li>
 *   <li>по краю — палый лес: бледные дубы, тыквы, паутина, черепа на кольях;</li>
 *   <li>вокруг — <b>пустота</b>: площадь висит в чёрном мире, а по кромке стоит
 *       невидимая стена {@link Keys#BARRIER}, чтобы с неё нельзя было сойти.</li>
 * </ul>
 */
public final class Lobby {

    public static final int CX = 20, CZ = 20;
    /** Верхний блок пола: ноги игрока на 64. */
    public static final int FLOOR = 63;
    /** Где появляется игрок (x, z) и куда он смотрит. */
    public static final double SPAWN_X = 20.5, SPAWN_Z = 32.5;
    public static final float SPAWN_YAW = 180f;
    /** Радиус невидимой стены: дальше площадь кончается и начинается пустота. */
    public static final double WALL_R = 25.0;
    /** Толщина стены: два блока, иначе на диагоналях остаются щели шириной в палец. */
    public static final double WALL_T = 2.4;
    /** Высота стены над полом. */
    public static final int WALL_H = 7;

    private Lobby() {
    }

    public static void build(Blueprint w) {
        ground(w);
        wall(w);
        pyre(w);
        gate(w, 20, 4, Kind.LANTERN);
        gate(w, 35, 30, Kind.RELAY);
        gate(w, 5, 30, Kind.INN);
        forest(w);
        scatter(w);
        lights(w);
    }

    /* ───────────── земля ───────────── */

    private static void ground(Blueprint w) {
        for (int x = CX - 26; x <= CX + 26; x++) {
            for (int z = CZ - 26; z <= CZ + 26; z++) {
                double r = Math.hypot(x - CX, z - CZ);
                if (r > 26) continue;
                if (r <= 15) {
                    w.put(x, FLOOR, z, Keys.TILES);
                } else if (r <= 16.2) {
                    w.put(x, FLOOR, z, Keys.BRICK);
                } else {
                    boolean bare = hash(x, z, 3) > 0.72;
                    w.put(x, FLOOR, z, bare ? Keys.PATH : Keys.GRASS_BLOCK);
                }
                if (onPath(x, z)) w.put(x, FLOOR, z, Keys.PATH);
                // остров: под площадкой два слоя камня, иначе она висит бумажным листом
                w.put(x, FLOOR - 1, z, Keys.STONE);
                if (r <= 24) w.put(x, FLOOR - 2, z, Keys.DIRT);
                if (r <= 18) w.put(x, FLOOR - 3, z, Keys.STONE);
                // над полом — воздух, иначе на траве остаются кусты генератора
                if (r <= 16.2) {
                    w.clear(x, FLOOR + 1, z);
                    w.clear(x, FLOOR + 2, z);
                }
            }
        }
    }

    /**
     * Невидимая стена по кромке: с площади нельзя сойти в пустоту.
     *
     * <p>Кольцо толщиной {@link #WALL_T}: одного блока не хватает — на диагоналях
     * между ступенчатыми блоками остаются щели, в которые проходит игрок.
     */
    private static void wall(Blueprint w) {
        for (int x = CX - 30; x <= CX + 30; x++) {
            for (int z = CZ - 30; z <= CZ + 30; z++) {
                // радиус по центру блока: кольцо получается сплошным
                double r = Math.hypot(x + 0.5 - CX, z + 0.5 - CZ);
                if (r < WALL_R || r > WALL_R + WALL_T) continue;
                for (int y = FLOOR + 1; y <= FLOOR + WALL_H; y++) {
                    w.put(x, y, z, Keys.BARRIER);
                }
            }
        }
    }

    private static boolean onPath(int x, int z) {
        return Math.hypot(x - 20, z - 20) < 21
                && (narrow(x, z, 20, 6) || narrow(x, z, 34, 29) || narrow(x, z, 6, 29));
    }

    /** Точка ближе 1.7 к отрезку (x0,z0)→(20,20). */
    private static boolean narrow(int x, int z, double x0, double z0) {
        double dx = 20 - x0, dz = 20 - z0;
        double len2 = dx * dx + dz * dz;
        double t = ((x - x0) * dx + (z - z0) * dz) / len2;
        if (t < -0.05 || t > 1.05) return false;
        double px = x0 + dx * t, pz = z0 + dz * t;
        return Math.hypot(x - px, z - pz) < 1.7;
    }

    /* ───────────── центр: костёр и столбы ───────────── */

    private static void pyre(Blueprint w) {
        for (int dx = -3; dx <= 3; dx++) {
            for (int dz = -3; dz <= 3; dz++) {
                int ring = Math.max(Math.abs(dx), Math.abs(dz));
                if (ring == 3) {
                    w.put(CX + dx, FLOOR + 1, CZ + dz,
                            (dx + dz) % 3 == 0 ? Keys.MOSSY_BRICK : Keys.BRICK);
                } else if (ring <= 2) {
                    w.put(CX + dx, FLOOR + 1, CZ + dz, Keys.TILES);
                }
            }
        }
        w.put(CX, FLOOR + 2, CZ, Keys.FIRE_ON);
        w.light(CX, FLOOR + 4, CZ, 15);

        int[][] posts = {{-4, -4}, {4, -4}, {-4, 4}, {4, 4}};
        for (int[] p : posts) {
            int x = CX + p[0], z = CZ + p[1];
            for (int y = FLOOR + 1; y <= FLOOR + 4; y++) w.put(x, y, z, Keys.LOG_DARK);
            w.put(x, FLOOR + 5, z, Keys.IRON_CHAIN);
            w.put(x, FLOOR + 6, z, Keys.LANTERN);
            w.light(x, FLOOR + 7, z, 13);
            w.putFacing(x + (p[0] > 0 ? 1 : -1), FLOOR + 1, z, Keys.PUMPKIN,
                    p[1] > 0 ? "north" : "south");
        }

        // скамьи по кругу + свечи на них
        for (int i = 0; i < 8; i++) {
            double a = Math.PI * 2 * i / 8;
            int x = CX + (int) Math.round(Math.cos(a) * 7);
            int z = CZ + (int) Math.round(Math.sin(a) * 7);
            w.put(x, FLOOR + 1, z, Keys.PLANKS_DARK);
            if (i % 2 == 0) w.put(x, FLOOR + 3, z, Keys.CANDLE_ON);
        }
    }

    /* ───────────── ворота в режимы ───────────── */

    public enum Kind {
        LANTERN("lantern", "ФОНАРЩИКИ"),
        RELAY("relay", "ЭСТАФЕТА СВЕТА"),
        INN("inn", "ПОСТОЯЛЫЙ ДВОР");

        public final String key, title;

        Kind(String key, String title) {
            this.key = key;
            this.title = title;
        }
    }

    /** Арка в режим: каменный портал, вывеска и своя тема внутри. */
    private static void gate(Blueprint w, int gx, int gz, Kind kind) {
        boolean alongX = kind == Kind.LANTERN;      // северная арка стоит поперёк оси Z
        for (int i = -3; i <= 3; i++) {
            for (int y = FLOOR + 1; y <= FLOOR + 6; y++) {
                int x = alongX ? gx + i : gx;
                int z = alongX ? gz : gz + i;
                boolean frame = Math.abs(i) == 3 || y == FLOOR + 6 || y == FLOOR + 1;
                boolean inside = Math.abs(i) <= 2 && y <= FLOOR + 5;
                if (frame) {
                    w.put(x, y, z, hash(x, y * 7 + z, 5) > 0.66 ? Keys.MOSSY_BRICK : Keys.BRICK);
                } else if (inside) {
                    w.clear(x, y, z);
                }
                if (frame) {
                    int x2 = alongX ? x : x + 1;
                    int z2 = alongX ? z - 1 : z;
                    w.put(x2, y, z2, hash(x2, y, z2) > 0.7 ? Keys.MOSSY_BRICK : Keys.BRICK);
                }
            }
        }
        // вывеска режима над аркой
        for (int i = -2; i <= 2; i++) {
            int x = alongX ? gx + i : gx;
            int z = alongX ? gz - 1 : gz + i;
            String key = switch (kind) {
                case LANTERN -> i == 0 ? Keys.JACK : Keys.WOOL_RED;
                case RELAY -> i == 0 ? Keys.SEA_LANTERN : Keys.WISP;
                case INN -> i == 0 ? Keys.JACK : Keys.PLANKS_DARK;
            };
            w.putFacing(x, FLOOR + 7, z, key, "south");
        }
        w.put(alongX ? gx - 3 : gx, FLOOR + 7, alongX ? gz : gz - 3, Keys.LANTERN);
        w.put(alongX ? gx + 3 : gx, FLOOR + 7, alongX ? gz : gz + 3, Keys.LANTERN);
        w.light(gx, FLOOR + 8, gz, 12);

        // паутина в углах: сразу видно, что тут давно никого не было
        w.put(alongX ? gx - 2 : gx, FLOOR + 5, alongX ? gz : gz - 2, Keys.COBWEB);
        w.put(alongX ? gx + 2 : gx, FLOOR + 5, alongX ? gz : gz + 2, Keys.COBWEB);

        switch (kind) {
            case LANTERN -> lanternGate(w, gx, gz, alongX);
            case RELAY -> relayGate(w, gx, gz, alongX);
            case INN -> innGate(w, gx, gz, alongX);
        }
    }

    private static void lanternGate(Blueprint w, int gx, int gz, boolean alongX) {
        int dx = alongX ? -2 : 0, dz = alongX ? 0 : -2;
        w.put(gx + dx, FLOOR + 1, gz + dz, Keys.FIRE_ON);
        w.put(gx - dx, FLOOR + 1, gz - dz, Keys.FIRE_OFF);
        w.light(gx + dx, FLOOR + 3, gz + dz, 13);
        for (int i = -2; i <= 2; i++) {
            w.put(alongX ? gx + i : gx + 2, FLOOR + 1, alongX ? gz + 2 : gz + i, Keys.FERN);
        }
        w.put(gx, FLOOR + 1, gz, Keys.PATH);
    }

    private static void relayGate(Blueprint w, int gx, int gz, boolean alongX) {
        for (int i = -2; i <= 2; i++) {
            for (int j = 1; j <= 3; j++) {
                int x = alongX ? gx + i : gx + j;
                int z = alongX ? gz + j : gz + i;
                w.put(x, FLOOR - 1, z, Keys.SAND);
                w.put(x, FLOOR, z, Keys.WATER);
            }
        }
        w.put(gx, FLOOR + 1, gz, Keys.SOUL_CAMPFIRE);
        w.light(gx, FLOOR + 3, gz, 14);
        w.put(alongX ? gx - 2 : gx + 2, FLOOR + 1, alongX ? gz + 3 : gz - 2, Keys.SCULK_VEIN);
        w.put(alongX ? gx + 2 : gx + 2, FLOOR + 1, alongX ? gz + 3 : gz + 2, Keys.SOUL_TORCH);
    }

    private static void innGate(Blueprint w, int gx, int gz, boolean alongX) {
        for (int i = -2; i <= 2; i++) {
            int x = alongX ? gx + i : gx + 1;
            int z = alongX ? gz + 1 : gz + i;
            w.put(x, FLOOR, z, Keys.PLANKS_DARK);
            w.clear(x, FLOOR + 1, z);
        }
        w.put(alongX ? gx - 2 : gx + 1, FLOOR + 1, alongX ? gz + 1 : gz - 2, Keys.BARREL);
        w.put(alongX ? gx + 2 : gx + 1, FLOOR + 1, alongX ? gz + 1 : gz + 2, Keys.BOOKSHELF);
        w.put(alongX ? gx : gx + 1, FLOOR + 1, alongX ? gz + 1 : gz, Keys.CARPET);
        w.put(alongX ? gx - 1 : gx + 1, FLOOR + 2, alongX ? gz + 1 : gz - 1, Keys.CANDLE_ON);
        w.put(alongX ? gx + 1 : gx + 1, FLOOR + 2, alongX ? gz + 1 : gz + 1, Keys.CANDLE_ON);
        w.light(gx, FLOOR + 3, gz + 1, 12);
    }

    /* ───────────── палый лес по краю ───────────── */

    private static void forest(Blueprint w) {
        for (int i = 0; i < 14; i++) {
            double a = Math.PI * 2 * i / 14 + 0.21;
            int x = CX + (int) Math.round(Math.cos(a) * 20);
            int z = CZ + (int) Math.round(Math.sin(a) * 20);
            if (Math.hypot(x - CX, z - CZ) < 18) continue;
            tree(w, x, z, 4 + (int) (hash(x, z, 9) * 3));
        }
        for (int x = CX - 24; x <= CX + 24; x++) {
            for (int z = CZ - 24; z <= CZ + 24; z++) {
                double r = Math.hypot(x - CX, z - CZ);
                if (r < 22 || r > 24) continue;
                if (hash(x, z, 11) > 0.45) w.put(x, FLOOR + 1, z, Keys.BUSH);
                if (hash(x, z, 12) > 0.85) w.put(x, FLOOR + 2, z, Keys.DEAD_BUSH);
            }
        }
    }

    private static void tree(Blueprint w, int x, int z, int height) {
        for (int y = FLOOR + 1; y <= FLOOR + height; y++) w.put(x, y, z, Keys.LOG_PALE);
        int top = FLOOR + height;
        for (int dy = -2; dy <= 2; dy++) {
            int radius = dy >= 1 ? 1 : 2;
            for (int dx = -radius; dx <= radius; dx++) {
                for (int dz = -radius; dz <= radius; dz++) {
                    if (Math.hypot(dx, dz) > radius + 0.4) continue;
                    if (hash(x + dx, top + dy, z + dz) < 0.16) continue;
                    w.put(x + dx, top + dy, z + dz, Keys.LEAVES);
                }
            }
        }
    }

    /* ───────────── мелочь по площади ───────────── */

    private static void scatter(Blueprint w) {
        int[][] spots = {{11, 11}, {29, 11}, {11, 29}, {29, 29}, {20, 9}, {31, 20}, {9, 20}, {20, 31}};
        for (int i = 0; i < spots.length; i++) {
            int x = spots[i][0], z = spots[i][1];
            if (i % 2 == 0) {
                w.putFacing(x, FLOOR + 1, z, Keys.PUMPKIN, facingToCenter(x, z));
            } else {
                w.put(x, FLOOR + 1, z, Keys.HAY);
            }
            if (hash(x, z, 21) > 0.5) w.put(x, FLOOR + 3, z, Keys.COBWEB);
        }
        for (int[] p : new int[][]{{17, 6}, {23, 6}, {33, 27}, {37, 33}, {7, 27}, {3, 33}}) {
            w.put(p[0], FLOOR + 1, p[1], Keys.LOG_DARK);
            w.put(p[0], FLOOR + 2, p[1], Keys.LOG_DARK);
            w.put(p[0], FLOOR + 3, p[1], Keys.SKULL);
            w.light(p[0], FLOOR + 4, p[1], 9);
        }
        for (int[] p : new int[][]{{16, 16}, {24, 16}, {16, 24}, {24, 24}}) {
            w.put(p[0], FLOOR + 5, p[1], Keys.COBWEB);
        }
    }

    private static String facingToCenter(int x, int z) {
        int dx = x - CX, dz = z - CZ;
        if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? "west" : "east";
        return dz > 0 ? "north" : "south";
    }

    private static void lights(Blueprint w) {
        for (int i = 0; i < 12; i++) {
            double a = Math.PI * 2 * i / 12 + 0.13;
            int x = CX + (int) Math.round(Math.cos(a) * 13);
            int z = CZ + (int) Math.round(Math.sin(a) * 13);
            w.put(x, FLOOR + 1, z, Keys.BRICK);
            w.put(x, FLOOR + 2, z, Keys.LANTERN);
            w.light(x, FLOOR + 3, z, 10);
        }
        for (int[] p : new int[][]{{20, 20}, {20, 12}, {28, 20}, {20, 28}, {12, 20},
                {14, 14}, {26, 14}, {14, 26}, {26, 26}}) {
            w.light(p[0], FLOOR + 9, p[1], 15);
        }
    }

    /* ───────────── утилиты ───────────── */

    /** Детерминированный «случайный» шум 0..1 — раскладка не меняется между запусками. */
    public static double hash(int x, int y, int z) {
        int n = x * 374761393 + y * 668265263 + z * 1274126177;
        n = (n ^ (n >> 13)) * 1274126177;
        return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0;
    }
}
