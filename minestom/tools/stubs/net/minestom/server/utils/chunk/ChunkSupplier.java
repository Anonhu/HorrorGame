package net.minestom.server.utils.chunk;
import net.minestom.server.instance.Chunk;
import net.minestom.server.instance.Instance;
public interface ChunkSupplier {
    Chunk createChunk(Instance instance, int chunkX, int chunkZ);
}
