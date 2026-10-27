package ru.nochfonarey.mc;

import net.minestom.server.MinecraftServer;
import net.minestom.server.instance.Clock;
import net.minestom.server.instance.InstanceContainer;
import net.minestom.server.instance.LightingChunk;
import net.minestom.server.instance.block.Block;

/** Мир комнаты: каменная плита под ногами, вечная ночь, воздух вокруг. */
public final class Worlds {

    private Worlds() {
    }

    public static InstanceContainer create() {
        InstanceContainer world = MinecraftServer.getInstanceManager().createInstanceContainer();
        world.setChunkSupplier(LightingChunk::new);
        world.setGenerator(unit ->
                unit.modifier().fillHeight(-64, (int) NetHost.Y - 2, Block.STONE));
        Clock clock = world.defaultClock();
        if (clock != null) {
            clock.pause();
            clock.time(18000);
        }
        world.setTime(18000);
        return world;
    }
}
