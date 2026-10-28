package ru.nochfonarey.mc;

import net.minestom.server.entity.Player;
import ru.nochfonarey.core.Lobby;

import java.util.Collection;

/**
 * «Дыхание» лобби: дым от костра, синий огонь у арки Эстафеты, искры фонарей
 * и редкий звук пещеры. Частицы уходят только тем, кто стоит на площади:
 * у каждой комнаты свой мир, и чужие частицы игроку не нужны.
 */
public final class Ambience {

    private Ambience() {
    }

    public static void lobby(Collection<Player> watchers, long ticks) {
        if (watchers.isEmpty() || ticks % 6 != 0) return;
        double cx = Lobby.CX + 0.5, cz = Lobby.CZ + 0.5, y = Lobby.FLOOR + 2.6;
        NetHost.particleFor(watchers, "minecraft:campfire_cosy_smoke", cx, y, cz, 2, 0.25);
        if (ticks % 18 == 0) {
            NetHost.particleFor(watchers, "minecraft:smoke", cx, y + 0.8, cz, 3, 0.5);
            NetHost.particleFor(watchers, "minecraft:soul_fire_flame",
                    35.5, Lobby.FLOOR + 1.6, 30.5, 2, 0.3);
            for (int[] p : new int[][]{{16, 16}, {24, 16}, {16, 24}, {24, 24}}) {
                NetHost.particleFor(watchers, "minecraft:end_rod",
                        p[0] + 0.5, Lobby.FLOOR + 6.4, p[1] + 0.5, 1, 0.05);
            }
        }
        if (ticks % 400 == 0) {
            NetHost.soundFor(watchers, Lobby.CX, Lobby.CZ, "minecraft:ambient.cave", 0.35f, 0.8f);
        }
    }
}
