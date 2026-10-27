package ru.leshorror.game;

import net.minestom.server.coordinate.Pos;
import net.minestom.server.entity.Player;
import net.minestom.server.instance.Instance;
import net.minestom.server.instance.block.Block;
import ru.leshorror.world.LesWorld;
import ru.leshorror.world.Palette;
import ru.leshorror.world.Plan;

/**
 * A shrine you must ignite by standing still inside it.
 * Movement resets the progress — the forest only accepts patience.
 */
public final class Shrine {
    public static final double RADIUS = 4.6;
    public static final double IGNITE_SECONDS = 2.4;

    private final int id;
    private final String name;
    private final int x;
    private final int z;
    private boolean lit;
    private double progress;

    public Shrine(Plan.Shrine plan) {
        this.id = plan.id();
        this.name = plan.name();
        this.x = plan.x();
        this.z = plan.z();
    }

    public int id() { return id; }
    public String name() { return name; }
    public int x() { return x; }
    public int z() { return z; }
    public boolean lit() { return lit; }
    public double progress() { return progress; }

    public double distanceTo(Player player) {
        Pos p = player.getPosition();
        return Math.hypot(p.x() - x, p.z() - z);
    }

    /**
     * @param moving true if the player is actively walking
     * @return true when the shrine becomes lit during this tick
     */
    public boolean tick(Player player, Instance instance, boolean moving, double dt) {
        if (lit) return false;
        if (distanceTo(player) > RADIUS) {
            progress = Math.max(0, progress - dt * 1.5);
            return false;
        }
        if (moving) {
            progress = Math.max(0, progress - dt * 0.6);
            return false;
        }
        progress = Math.min(1, progress + dt / IGNITE_SECONDS);
        if (progress >= 1) {
            ignite(instance);
            return true;
        }
        return false;
    }

    public void ignite(Instance instance) {
        if (lit) return;
        lit = true;
        progress = 1;
        // the dormant carved pumpkin on top of the cairn wakes up
        instance.setBlock(x, LesWorld.SPAWN_Y + 4, z, Palette.IGNITED);
        // ring of lanterns lights up
        for (int i = 0; i < 8; i++) {
            double a = i / 8.0 * Math.PI * 2;
            int px = x + (int) Math.round(Math.cos(a) * 4);
            int pz = z + (int) Math.round(Math.sin(a) * 4);
            if (i % 2 == 1) continue;
            instance.setBlock(px, LesWorld.SPAWN_Y + 1, pz, Palette.LANTERN);
        }
        instance.setBlock(x, LesWorld.SPAWN_Y + 3, z, Block.REDSTONE_LAMP);
    }

    public void reset(Instance instance) {
        lit = false;
        progress = 0;
        instance.setBlock(x, LesWorld.SPAWN_Y + 4, z, Palette.DORMANT);
        instance.setBlock(x, LesWorld.SPAWN_Y + 3, z, Palette.STONE);
    }
}
