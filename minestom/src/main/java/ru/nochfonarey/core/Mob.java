package ru.nochfonarey.core;

/** Простое существо: ядро считает позицию, слой Minecraft рисует. */
public final class Mob {
    public final String id;
    public final String type;      // ключ сущности, например "minecraft:zombie"
    public double x, z;
    public float yaw;
    public boolean dead = false;
    public double stunnedUntil = -1;
    public Mob target;

    public Mob(String id, String type, double x, double z) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.z = z;
    }

    public double dist(double bx, double bz) {
        double dx = bx - x, dz = bz - z;
        return Math.sqrt(dx * dx + dz * dz);
    }
}
