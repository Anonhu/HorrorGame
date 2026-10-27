package ru.leshorror.world;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.minestom.server.instance.block.Block;

/**
 * Style guide for the forest. Everything visible goes through here,
 * so the whole grove can be re-skinned from a single file.
 *
 * <p>Palette: ink, bone, amber, ember, moss — same as the browser slice.
 * Only 26.3 blocks are used so the world matches "Wilderness Bound".
 */
public final class Palette {
    private Palette() {}

    // ---- ground ----
    public static final Block GROUND = Block.COARSE_DIRT;
    public static final Block GROUND_ALT = Block.MOSS_BLOCK;
    public static final Block UNDERGROUND = Block.DIRT;

    // ---- the 26.3 poplar grove ----
    public static final Block TRUNK = Block.POPLAR_LOG;
    public static final Block TRUNK_FALLEN = Block.POPLAR_WOOD;
    public static final Block LEAF_EMBER = Block.RED_POPLAR_LEAVES;
    public static final Block LEAF_GOLD = Block.ORANGE_POPLAR_LEAVES;
    public static final Block LEAF_PALE = Block.YELLOW_POPLAR_LEAVES;
    public static final Block SAPLING = Block.POPLAR_SAPLING;
    public static final Block SHELF = Block.POPLAR_SHELF;

    // ---- decoration ----
    public static final Block GRASS = Block.SHORT_GRASS;
    public static final Block SHRUB = Block.BUSH;
    public static final Block PUMPKIN = Block.PUMPKIN;
    public static final Block LANTERN = Block.JACK_O_LANTERN;
    public static final Block STONE = Block.COBBLESTONE;
    public static final Block MOSSY = Block.MOSSY_COBBLESTONE;
    public static final Block SLAB = Block.POPLAR_SLAB;
    public static final Block FENCE = Block.POPLAR_FENCE;

    // ---- lighting it up ----
    /** carved pumpkin, the only warm light source in the slice. */
    public static final Block IGNITED = Block.JACK_O_LANTERN;
    /** cold burned-out pumpkin. */
    public static final Block DORMANT = Block.CARVED_PUMPKIN;

    /** pseudo-random leaf mix, deterministic per tree. */
    public static Block leavesFor(long seed) {
        return switch ((int) Math.floorMod(seed, 3)) {
            case 0 -> LEAF_EMBER;
            case 1 -> LEAF_GOLD;
            default -> LEAF_PALE;
        };
    }

    // ---- text helpers ----
    public static Component whisper(String text) {
        return Component.text(text, NamedTextColor.GRAY).decoration(TextDecoration.ITALIC, true);
    }

    public static Component warn(String text) {
        return Component.text(text, NamedTextColor.RED).decoration(TextDecoration.ITALIC, true);
    }

    public static Component ritual(String text) {
        return Component.text(text, NamedTextColor.GOLD);
    }

    public static Component dim(String text) {
        return Component.text(text, NamedTextColor.DARK_GRAY);
    }

    public static Component noise(int level) {
        NamedTextColor color = level > 66 ? NamedTextColor.RED
                : level > 33 ? NamedTextColor.GOLD
                : NamedTextColor.GREEN;
        return Component.text("шум ", NamedTextColor.DARK_GRAY)
                .append(Component.text("▮".repeat(Math.max(1, level / 10 + 1)), color));
    }
}
