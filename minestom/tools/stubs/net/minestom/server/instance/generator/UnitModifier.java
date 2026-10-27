package net.minestom.server.instance.generator;
import net.minestom.server.instance.block.Block;
public interface UnitModifier {
    void fillHeight(int minHeight, int maxHeight, Block block);
    void fill(Block block);
}
