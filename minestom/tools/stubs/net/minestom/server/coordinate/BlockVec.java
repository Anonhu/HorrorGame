package net.minestom.server.coordinate;
public record BlockVec(int blockX, int blockY, int blockZ) implements Point {
    public double x() { return blockX; }
    public double y() { return blockY; }
    public double z() { return blockZ; }
}
