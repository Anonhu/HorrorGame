package ru.nochfonarey.mc;

import net.minestom.server.instance.InstanceContainer;
import net.minestom.server.instance.block.Block;
import ru.nochfonarey.core.Blueprint;

/**
 * {@link Blueprint} поверх настоящего мира Minestom.
 *
 * Ключи {@code core} переводятся в блоки здесь, в одном месте: раскладка
 * лобби ничего не знает про {@code net.minestom.*} и поэтому рисуется
 * офлайн (см. {@code tools/preview/LobbyPreview.java}).
 */
public final class McBlueprint implements Blueprint {

    private final InstanceContainer world;

    public McBlueprint(InstanceContainer world) {
        this.world = world;
    }

    public InstanceContainer world() {
        return world;
    }

    @Override
    public void put(int x, int y, int z, String key) {
        world.setBlock(x, y, z, BlockMap.get(key));
    }

    @Override
    public void light(int x, int y, int z, int level) {
        world.setBlock(x, y, z, level <= 0 ? Block.AIR : BlockMap.light(level));
    }

    @Override
    public void putFacing(int x, int y, int z, String key, String facing) {
        world.setBlock(x, y, z, BlockMap.turn(key, facing));
    }
}
