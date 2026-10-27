package ru.leshorror.world;

import net.minestom.server.coordinate.BlockVec;
import net.minestom.server.instance.block.Block;
import net.minestom.server.instance.generator.GenerationUnit;
import net.minestom.server.instance.generator.Generator;
import net.minestom.server.instance.generator.UnitModifier;

import java.util.Random;

/**
 * Generates the poplar grove of "Wilderness Bound".
 *
 * <p>Chunk generation must be deterministic and cheap: the same seed
 * always yields the same grove, so shrines and the trail stay put.
 * Everything is placed relative to the shrine/trail plan produced by
 * {@link Plan}, which is static and shared with the gameplay code.
 */
public final class ForestGenerator implements Generator {

    private static final int GROUND_Y = 62;
    public static final int LEAF_TOP = 18;
    private final long seed;

    public ForestGenerator(long seed) {
        this.seed = seed;
    }

    @Override
    public void generate(GenerationUnit unit) {
        UnitModifier mod = unit.modifier();
        BlockVec start = unit.absoluteStart();
        BlockVec end = unit.absoluteEnd();

        for (int x = start.blockX(); x < end.blockX(); x++) {
            for (int z = start.blockZ(); z < end.blockZ(); z++) {
                // deterministic per-column seed
                long h = hash(x, z);
                Random r = new Random(h);

                // ---- ground layers ----
                for (int y = start.blockY(); y < end.blockY(); y++) {
                    if (y > GROUND_Y) {
                        mod.setBlock(x, y, z, Block.AIR);
                    } else if (y == GROUND_Y) {
                        mod.setBlock(x, y, z, groundAt(x, z, r));
                    } else if (y > GROUND_Y - 4) {
                        mod.setBlock(x, y, z, Palette.UNDERGROUND);
                    } else {
                        mod.setBlock(x, y, z, Block.STONE);
                    }
                }

                if (start.blockY() > GROUND_Y + LEAF_TOP) continue;

                // ---- trees ----
                if (shouldPlaceTree(x, z, r)) {
                    plantPoplar(mod, x, GROUND_Y, z, r);
                } else if (r.nextFloat() < 0.16f) {
                    // leaves-litter / shrubs
                    mod.setBlock(x, GROUND_Y + 1, z, r.nextBoolean() ? Palette.GRASS : Palette.SHRUB);
                } else if (r.nextFloat() < 0.012f) {
                    mod.setBlock(x, GROUND_Y + 1, z, Palette.SAPLING);
                }
            }
        }
    }

    private Block groundAt(int x, int z, Random r) {
        float n = noise(x * 0.06, z * 0.06);
        if (Plan.distanceToPath(x, z) < 2.2) return Palette.GROUND;
        if (n > 0.62) return Palette.GROUND_ALT;
        if (r.nextFloat() < 0.05f) return Block.PODZOL;
        return Palette.GROUND;
    }

    /* ---------------- trees ---------------- */
    private boolean shouldPlaceTree(int x, int z, Random r) {
        if (Plan.isShrineArea(x, z, 7)) return false;
        if (Plan.isCampArea(x, z, 6)) return false;
        if (Plan.distanceToPath(x, z) < 3.2) return false;
        if (Math.hypot(x, z) < 12) return false;          // spawn clearing
        double radius = Math.hypot(x, z);
        if (radius > Plan.GROVE_RADIUS) return false;

        // poisson-ish spacing via a coarse grid hash
        int gx = Math.floorDiv(x, 5), gz = Math.floorDiv(z, 5);
        Random gr = new Random(hash(gx * 31, gz * 17));
        if (gr.nextFloat() > 0.55f) return false;
        int ox = gx * 5 + gr.nextInt(5), oz = gz * 5 + gr.nextInt(5);
        if (ox != x || oz != z) return false;
        return r.nextFloat() < 0.95f;
    }

    private void plantPoplar(UnitModifier mod, int x, int baseY, int z, Random r) {
        int height = 9 + r.nextInt(6);
        Block leaf = Palette.leavesFor(hash(x, z) / 7);

        // trunk: keep the top two blocks as bark, then a bare crown
        for (int i = 1; i <= height; i++) {
            mod.setBlock(x, baseY + i, z, Palette.TRUNK);
        }
        // flare at the base — poplars have roots that grip
        mod.setBlock(x + 1, baseY, z, Palette.TRUNK);
        mod.setBlock(x - 1, baseY, z, Palette.TRUNK);
        mod.setBlock(x, baseY, z + 1, Palette.TRUNK);
        mod.setBlock(x, baseY, z - 1, Palette.TRUNK);

        // canopy: sparse, high, and irregular
        int top = baseY + height;
        for (int dy = -4; dy <= 2; dy++) {
            int layer = 4 - Math.abs(dy + 1);
            int rad = Math.max(1, layer);
            for (int dx = -rad; dx <= rad; dx++) {
                for (int dz = -rad; dz <= rad; dz++) {
                    int d2 = dx * dx + dz * dz;
                    if (d2 > rad * rad + 1) continue;
                    if (dx == 0 && dz == 0) continue;
                    if (r.nextFloat() < 0.18f) continue;   // holes → moonlight
                    mod.setBlock(x + dx, top + dy, z + dz, leaf);
                }
            }
        }
        // shelf mushrooms (26.3) on some trunks
        if (r.nextFloat() < 0.10f) {
            int sy = baseY + 2 + r.nextInt(Math.max(1, height - 4));
            int side = r.nextInt(4);
            int sx = x + (side == 0 ? 1 : side == 1 ? -1 : 0);
            int sz = z + (side == 2 ? 1 : side == 3 ? -1 : 0);
            mod.setBlock(sx, sy, sz, Palette.SHELF);
        }
    }

    /* ---------------- helpers ---------------- */
    private long hash(int x, int z) {
        long h = seed;
        h = h * 6364136223846793005L + x * 1442695040888963407L;
        h = h * 6364136223846793005L + z * 1442695040888963407L;
        h ^= (h >>> 33);
        h *= 0xff51afd7ed558ccdL;
        h ^= (h >>> 33);
        return h;
    }

    private float noise(double x, double y) {
        double fx = Math.floor(x), fy = Math.floor(y);
        double tx = x - fx, ty = y - fy;
        double v00 = rnd(fx, fy), v10 = rnd(fx + 1, fy), v01 = rnd(fx, fy + 1), v11 = rnd(fx + 1, fy + 1);
        double sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        double a = v00 + (v10 - v00) * sx;
        double b = v01 + (v11 - v01) * sx;
        return (float) (a + (b - a) * sy);
    }

    private double rnd(double x, double y) {
        long h = hash((int) x, (int) y);
        return (h >>> 11) / (double) (1L << 53);
    }
}
