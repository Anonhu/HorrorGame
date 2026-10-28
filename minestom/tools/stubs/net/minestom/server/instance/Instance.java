package net.minestom.server.instance;
import net.minestom.server.entity.Player;
import net.minestom.server.utils.chunk.ChunkSupplier;

import java.util.Set;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.instance.block.Block;
public class Instance {
    public void setBlock(int x, int y, int z, Block block) { }
    public void setTime(long time) { }
    public Clock defaultClock() { return null; }
    public void setChunkSupplier(ChunkSupplier supplier) { }
    public void setGenerator(net.minestom.server.instance.generator.Generator generator) { }
    public Set<Player> getPlayers() { return null; }
    public net.minestom.server.instance.block.Block getBlock(int x, int y, int z) { return null; }
    public java.util.Collection<Chunk> getChunks() { return null; }
}
