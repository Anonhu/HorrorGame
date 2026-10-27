package ru.leshorror.world;

import net.minestom.server.MinecraftServer;
import net.minestom.server.instance.InstanceContainer;
import net.minestom.server.instance.InstanceManager;
import net.minestom.server.instance.block.Block;

import java.util.Random;

/**
 * Owns the instance: the grove generator, the time of night and the
 * static set dressing (trail leaves, shrines, camps, ritual circle).
 */
public final class LesWorld {
    public static final int SPAWN_Y = 64;

    private final InstanceContainer instance;

    public LesWorld() {
        InstanceManager instances = MinecraftServer.getInstanceManager();
        this.instance = instances.createInstanceContainer();
        this.instance.setGenerator(new ForestGenerator(2603L));
        // eternal 23:40 — the whole slice happens in one night
        this.instance.setTime(23800);
        this.instance.setTimeRate(0);
    }

    public InstanceContainer instance() {
        return instance;
    }

    /* ============================================================
       Set dressing placed after generation: only touches air/ground
       ============================================================ */
    public void buildSetDressing() {
        buildTrail();
        for (Plan.Shrine s : Plan.SHRINES) buildShrine(s);
        for (Plan.Camp c : Plan.CAMPS) buildCamp(c);
        buildRitualCircle();
    }

    private void buildTrail() {
        Random r = new Random(77);
        for (Plan.TrailPoint p : Plan.TRAIL) {
            int x = (int) Math.round(p.x());
            int z = (int) Math.round(p.z());
            for (int i = 0; i < 3; i++) {
                int ox = x + r.nextInt(5) - 2;
                int oz = z + r.nextInt(5) - 2;
                if (instance.getBlock(ox, SPAWN_Y, oz).isAir()) continue;
                if (!instance.getBlock(ox, SPAWN_Y + 1, oz).isAir()) continue;
                // fallen leaf litter reads as "кровавая листва" at night
                instance.setBlock(ox, SPAWN_Y, oz, Block.ORANGE_POPLAR_LEAVES);
            }
        }
    }

    private void buildShrine(Plan.Shrine s) {
        int y = SPAWN_Y;
        // cairn
        instance.setBlock(s.x(), y + 1, s.z(), Palette.STONE);
        instance.setBlock(s.x(), y + 2, s.z(), Palette.MOSSY);
        instance.setBlock(s.x(), y + 3, s.z(), Palette.STONE);

        // dormant carved pumpkin — the thing the player must ignite
        instance.setBlock(s.x(), y + 4, s.z(), Palette.DORMANT);

        // ring of pumpkins + rune stones, 9 blocks across
        for (int i = 0; i < 8; i++) {
            double a = i / 8.0 * Math.PI * 2;
            int px = s.x() + (int) Math.round(Math.cos(a) * 4);
            int pz = s.z() + (int) Math.round(Math.sin(a) * 4);
            instance.setBlock(px, y + 1, pz, i % 2 == 0 ? Palette.PUMPKIN : Palette.STONE);
            if (i % 4 == 0) {
                instance.setBlock(px, y + 2, pz, Palette.FENCE);
            }
        }
        // frost marks the outer edge
        for (int i = 0; i < 12; i++) {
            double a = i / 12.0 * Math.PI * 2;
            int px = s.x() + (int) Math.round(Math.cos(a) * 8);
            int pz = s.z() + (int) Math.round(Math.sin(a) * 8);
            if (instance.getBlock(px, y, pz).isAir()) continue;
            instance.setBlock(px, y, pz, Block.SNOW);
        }
    }

    private void buildCamp(Plan.Camp c) {
        int y = SPAWN_Y;
        // tent-ish frame
        for (int i = -2; i <= 2; i++) {
            instance.setBlock(c.x() + i, y + 1, c.z() - 2, Palette.SLAB);
            instance.setBlock(c.x() + i, y + 1, c.z() + 2, Palette.SLAB);
        }
        instance.setBlock(c.x(), y + 1, c.z(), Block.CAMPFIRE);
        instance.setBlock(c.x() + 1, y + 1, c.z(), Palette.TRUNK_FALLEN);
        instance.setBlock(c.x() - 1, y + 1, c.z(), Palette.TRUNK_FALLEN);
        // abandoned straw bed — the 26.3 block, left behind in a hurry
        instance.setBlock(c.x() + 2, y + 1, c.z() + 1, Block.STRAW_BED);
        instance.setBlock(c.x() - 3, y + 1, c.z() + 1, Palette.PUMPKIN);
        instance.setBlock(c.x() + 3, y + 2, c.z() - 1, Palette.FENCE);
    }

    private void buildRitualCircle() {
        int y = SPAWN_Y;
        for (int i = 0; i < 6; i++) {
            double a = i / 6.0 * Math.PI * 2;
            int x = (int) Math.round(Math.cos(a) * 6);
            int z = (int) Math.round(Math.sin(a) * 6);
            instance.setBlock(x, y + 1, z, Palette.STONE);
            instance.setBlock(x, y + 2, z, Palette.MOSSY);
        }
        // altar
        instance.setBlock(0, y + 1, 0, Block.DECORATED_POT);
        instance.setBlock(0, y + 2, 0, Palette.DORMANT);
        // the four directions marked by jack-o'-lanterns
        for (int i = 0; i < 4; i++) {
            double a = i / 4.0 * Math.PI * 2 + Math.PI / 4;
            int x = (int) Math.round(Math.cos(a) * 4.5);
            int z = (int) Math.round(Math.sin(a) * 4.5);
            instance.setBlock(x, y + 1, z, Palette.LANTERN);
        }
    }
}
