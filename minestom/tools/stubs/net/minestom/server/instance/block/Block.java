package net.minestom.server.instance.block;
public interface Block {
    Block AIR = null;
    Block STONE = null;
    Block SEA_LANTERN = null;
    Block DEEPSLATE_TILES = null;
    Block CAMPFIRE = null;
    Block LODESTONE = null;
    Block DARK_OAK_LOG = null;
    static Block fromKey(String key) { return null; }
    Block withProperty(String key, String value);
}
