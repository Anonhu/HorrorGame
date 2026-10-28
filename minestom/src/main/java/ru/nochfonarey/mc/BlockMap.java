package ru.nochfonarey.mc;

import net.minestom.server.instance.block.Block;
import ru.nochfonarey.core.Keys;

import java.util.HashMap;
import java.util.Map;

/**
 * Переводит строковые ключи ядра в настоящие блоки Minecraft 26.3.
 * Свойства ставятся по одному и глушатся, если версия их не знает:
 * сервер не должен падать из-за переименованного блока.
 */
public final class BlockMap {

    private static final Map<String, String> NAME = new HashMap<>();
    private static final Map<String, String[]> PROPS = new HashMap<>();
    private static final Map<String, Block> CACHE = new HashMap<>();

    private static void put(String key, String id, String... props) {
        NAME.put(key, id);
        if (props.length > 0) PROPS.put(key, props);
    }

    static {
        put(Keys.AIR, "minecraft:air");
        put(Keys.GRASS, "minecraft:grass_block");
        put(Keys.DIRT, "minecraft:dirt");
        put(Keys.STONE, "minecraft:stone");
        put(Keys.PATH, "minecraft:coarse_dirt");

        // Фонарщики
        put(Keys.FIRE_ON, "minecraft:campfire", "lit", "true");
        put(Keys.FIRE_OFF, "minecraft:campfire", "lit", "false");
        put(Keys.LOGS, "minecraft:oak_log", "axis", "y");
        put(Keys.TRUNK, "minecraft:dark_oak_log", "axis", "y");
        put(Keys.LEAVES, "minecraft:pale_oak_leaves", "persistent", "true");
        put(Keys.BUSH, "minecraft:fern");
        put(Keys.GRABBER, "minecraft:sculk_vein");
        put(Keys.BODY, "minecraft:skeleton_skull");

        // Эстафета
        put(Keys.WATER, "minecraft:water");
        put(Keys.SAND, "minecraft:sand");
        put(Keys.CHAPEL, "minecraft:stone_bricks");
        put(Keys.ALTAR, "minecraft:lodestone");
        put(Keys.DECOY, "minecraft:soul_torch");
        put(Keys.WISP, "minecraft:light", "level", "9");

        // Постоялый двор
        put(Keys.FLOOR_HALL, "minecraft:dark_oak_planks");
        put(Keys.FLOOR_ROOM, "minecraft:oak_planks");
        put(Keys.FLOOR_CELLAR, "minecraft:deepslate_tiles");
        put(Keys.WALL, "minecraft:spruce_planks");
        put(Keys.DOOR, "minecraft:air");
        put(Keys.DOOR_LOCKED, "minecraft:iron_bars");
        put(Keys.CANDLE_ON, "minecraft:candle", "lit", "true", "candles", "1");
        put(Keys.CANDLE_OFF, "minecraft:candle", "lit", "false", "candles", "1");
        put(Keys.CARPET, "minecraft:red_carpet");

        // Лобби и комнаты ожидания
        put(Keys.COBWEB, "minecraft:cobweb");
        put(Keys.MOSSY_BRICK, "minecraft:mossy_stone_bricks");
        put(Keys.MOSS, "minecraft:moss_block");
        put(Keys.SOUL_CAMPFIRE, "minecraft:soul_campfire", "lit", "true");
        put(Keys.IRON_CHAIN, "minecraft:iron_chain");
        put(Keys.BARREL, "minecraft:barrel");
        put(Keys.BOOKSHELF, "minecraft:bookshelf");
        put(Keys.PUMPKIN, "minecraft:carved_pumpkin");
        put(Keys.JACK, "minecraft:jack_o_lantern");
        put(Keys.HAY, "minecraft:hay_block", "axis", "y");
        put(Keys.PALE_LOG, "minecraft:pale_oak_log", "axis", "y");
        put(Keys.DEAD_BUSH, "minecraft:dead_bush");
        put(Keys.SKULL, "minecraft:skeleton_skull");
        put(Keys.LANTERN, "minecraft:lantern");
        put(Keys.SOUL_LANTERN, "minecraft:soul_lantern");
        put(Keys.TORCH, "minecraft:torch");
        put(Keys.SOUL_TORCH, "minecraft:soul_torch");
        put(Keys.FERN, "minecraft:fern");
        put(Keys.SCULK_VEIN, "minecraft:sculk_vein");
        put(Keys.LODESTONE, "minecraft:lodestone");
        put(Keys.TILES, "minecraft:deepslate_tiles");
        put(Keys.BRICK, "minecraft:stone_bricks");
        put(Keys.PLANKS_DARK, "minecraft:dark_oak_planks");
        put(Keys.PLANKS_SPRUCE, "minecraft:spruce_planks");
        put(Keys.LOG_DARK, "minecraft:dark_oak_log", "axis", "y");
        put(Keys.LOG_PALE, "minecraft:pale_oak_log", "axis", "y");
        put(Keys.IRON_BARS, "minecraft:iron_bars");
        put(Keys.GRASS_BLOCK, "minecraft:grass_block");
        put(Keys.WOOL_RED, "minecraft:red_wool");
        put(Keys.SEA_LANTERN, "minecraft:sea_lantern");
    }

    private BlockMap() {
    }

    public static Block get(String key) {
        Block cached = CACHE.get(key);
        if (cached != null) return cached;
        Block built = build(key);
        CACHE.put(key, built);
        return built;
    }

    private static Block build(String key) {
        String id = NAME.get(key);
        if (id == null) {
            id = key.startsWith("minecraft:") ? key : "minecraft:" + key;
        }
        Block block = Block.fromKey(id);
        if (block == null) return Block.STONE;
        String[] props = PROPS.get(key);
        if (props != null) {
            for (int i = 0; i + 1 < props.length; i += 2) {
                try {
                    block = block.withProperty(props[i], props[i + 1]);
                } catch (RuntimeException ignored) {
                    // свойство исчезло в этой версии — оставляем базовый блок
                }
            }
        }
        return block;
    }

    /** Тот же блок, но с поворотом (тыквы, полки и т.п.). */
    public static Block turn(String key, String facing) {
        try {
            return get(key).withProperty("facing", facing);
        } catch (RuntimeException e) {
            return get(key);
        }
    }

    /** Светящийся невидимый блок: используется как источник света. */
    public static Block light(int level) {
        int l = Math.max(1, Math.min(15, level));
        try {
            return Block.fromKey("minecraft:light").withProperty("level", String.valueOf(l));
        } catch (RuntimeException e) {
            return Block.SEA_LANTERN;
        }
    }
}
