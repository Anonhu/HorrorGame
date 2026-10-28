package ru.nochfonarey.mc;

import net.minestom.server.MinecraftServer;
import net.minestom.server.instance.Clock;
import net.minestom.server.instance.InstanceContainer;
import net.minestom.server.instance.LightingChunk;

/**
 * Мир игры: <b>пустота</b> и вечная ночь.
 *
 * <p>Раньше генератор заливал камень от -64 до 62, и всё вокруг площадки было
 * плоским каменным полем: игрок сходил с лобби и уходил гулять по «миру»,
 * а сервер при этом считал, что он всё ещё на площади. Теперь генератора нет —
 * есть только то, что построила игра, а вокруг ничего. Упал — вернут на спавн
 * (см. {@code Hub.guard}).
 */
public final class Worlds {

    private Worlds() {
    }

    /** Пустой ночной мир: ни земли, ни деревьев, только то, что поставят. */
    public static InstanceContainer create() {
        InstanceContainer world = MinecraftServer.getInstanceManager().createInstanceContainer();
        world.setChunkSupplier(LightingChunk::new);
        // генератора нет: чанк рождается пустым — вокруг площадок настоящая пустота
        Clock clock = world.defaultClock();
        if (clock != null) {
            clock.pause();
            clock.time(18000);
        }
        world.setTime(18000);
        return world;
    }
}
