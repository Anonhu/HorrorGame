package net.minestom.server.instance;
import net.minestom.server.utils.chunk.ChunkSupplier;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.instance.block.Block;
public class Instance {
    public void setBlock(int x, int y, int z, Block block) { }
    public void setTime(long time) { }
    public Clock defaultClock() { return null; }
    public void setChunkSupplier(ChunkSupplier supplier) { }
    public void setGenerator(net.minestom.server.instance.generator.Generator generator) { }
}
