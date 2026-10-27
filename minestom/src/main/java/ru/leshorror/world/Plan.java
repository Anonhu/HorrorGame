package ru.leshorror.world;

import java.util.ArrayList;
import java.util.List;

/**
 * The static plan of the forest: where the four shrines, the camps and the
 * crimson leaf trail live. Shared by the generator (so trees don't grow on
 * the path) and the gameplay (so the compass and the stag know where to go).
 *
 * <p>Mirrors {@code web/src/world/layout.js}.
 */
public final class Plan {
    private Plan() {}

    public static final int GROVE_RADIUS = 104;
    public static final int SPAWN_CLEAR = 13;

    public record Shrine(int id, String name, int x, int z) {}

    public record Camp(int x, int z) {}

    public record TrailPoint(double x, double z) {}

    public static final List<Shrine> SHRINES = List.of(
            new Shrine(0, "Костяной круг", 47, 32),
            new Shrine(1, "Тихая яма", -38, 56),
            new Shrine(2, "Старый камп", -61, -22),
            new Shrine(3, "Сухой ручей", 21, -68)
    );

    public static final List<Camp> CAMPS = List.of(
            new Camp(28, 44),
            new Camp(-18, 38),
            new Camp(-44, -44)
    );

    public static final List<TrailPoint> TRAIL = new ArrayList<>();

    static {
        // spawn → shrine 0 → 1 → 2 → 3 → back to spawn
        List<double[]> loop = new ArrayList<>();
        loop.add(new double[]{0, 0});
        for (Shrine s : SHRINES) loop.add(new double[]{s.x(), s.z()});
        loop.add(new double[]{0, 0});
        for (int i = 0; i < loop.size() - 1; i++) {
            double[] a = loop.get(i), b = loop.get(i + 1);
            double len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            int steps = (int) Math.ceil(len / 2.0);
            for (int k = 0; k < steps; k++) {
                double t = k / (double) steps;
                TRAIL.add(new TrailPoint(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t));
            }
        }
    }

    /** distance from a block column to the crimson trail. */
    public static double distanceToPath(double x, double z) {
        double best = Double.MAX_VALUE;
        for (int i = 0; i < TRAIL.size(); i += 2) {
            TrailPoint p = TRAIL.get(i);
            double d = (p.x() - x) * (p.x() - x) + (p.z() - z) * (p.z() - z);
            if (d < best) best = d;
        }
        return Math.sqrt(best);
    }

    public static boolean isShrineArea(double x, double z, double pad) {
        for (Shrine s : SHRINES) {
            if (Math.hypot(s.x() - x, s.z() - z) < 9 + pad) return true;
        }
        return false;
    }

    public static boolean isCampArea(double x, double z, double pad) {
        for (Camp c : CAMPS) {
            if (Math.hypot(c.x() - x, c.z() - z) < 7 + pad) return true;
        }
        return false;
    }

    public static Shrine shrine(int id) {
        return SHRINES.get(id);
    }
}
