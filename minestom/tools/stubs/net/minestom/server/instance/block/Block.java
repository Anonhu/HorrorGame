package net.minestom.server.instance.block;

/**
 * Заглушка Block: только те константы, которые вызывает игра.
 * Каждое имя сверяется с автогенерируемым Blocks.java в 26.3
 * (tools/verify_stubs.py), так что переименованный блок сразу виден.
 */
public interface Block {
    Block AIR = null;
    Block COARSE_DIRT = null;
    Block DARK_OAK_LOG = null;
    Block DARK_OAK_PLANKS = null;
    Block DEEPSLATE_TILES = null;
    Block DIRT = null;
    Block GRASS_BLOCK = null;
    Block IRON_BARS = null;
    Block IRON_CHAIN = null;
    Block MOSSY_STONE_BRICKS = null;
    Block RED_WOOL = null;
    Block SAND = null;
    Block SEA_LANTERN = null;
    Block SPRUCE_PLANKS = null;
    Block STONE = null;
    Block STONE_BRICKS = null;
    Block WATER = null;
    static Block fromKey(String key) { return null; }
    Block withProperty(String key, String value);
}
