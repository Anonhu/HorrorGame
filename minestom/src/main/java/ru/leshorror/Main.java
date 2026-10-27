package ru.leshorror;

import net.minestom.server.MinecraftServer;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.event.EventNode;
import net.minestom.server.event.GlobalEventHandler;
import ru.leshorror.game.SessionManager;
import ru.leshorror.game.StagHollow;
import ru.leshorror.world.LesWorld;

/**
 * ЛЕС СЛУШАЕТ — Minestom 26.3 vertical slice (server side).
 *
 * <p>Design mirror of the browser prototype:
 * <ul>
 *   <li>generated poplar grove (Wilderness Bound blocks),</li>
 *   <li>four shrines that must be lit by standing still inside them,</li>
 *   <li>a Hollow Stag that only moves when nobody looks at it,</li>
 *   <li>noise as the core resource: sprinting, the lantern and every
 *       echo ping feed it.</li>
 * </ul>
 *
 * <p><b>Build note:</b> Minestom has not released 26.3 yet. This project
 * depends on the {@code 26_3} branch through JitPack. If JitPack fails,
 * switch {@code build.gradle.kts} to the latest 26.2 release — the gameplay
 * code is written against the 26.2/26.3 shared API.
 */
public final class Main {

    public static void main(String[] args) {
        MinecraftServer.init();
        MinecraftServer.setCompressionThreshold(0);

        LesWorld world = new LesWorld();
        SessionManager sessions = new SessionManager(world);
        StagHollow stag = new StagHollow(world.instance(), sessions);

        GlobalEventHandler events = MinecraftServer.getGlobalEventHandler();
        EventNode<net.minestom.server.event.Event> node = EventNode.all("les-slushaet");
        new LesListener(world, sessions, stag).register(node);
        events.addChild(node);

        // one tick every 100 ms is plenty for a horror prototype
        MinecraftServer.getSchedulerManager()
                .buildTask(() -> {
                    stag.tick();
                    sessions.tick(stag);
                })
                .repeat(java.time.Duration.ofMillis(100))
                .schedule();

        // the leaf trail and the ritual circle are static world decoration
        world.buildSetDressing();

        MinecraftServer.start(new Pos(0.5, LesWorld.SPAWN_Y, 4.5, 180f, 0f));
        System.out.println("[ЛЕС СЛУШАЕТ] сервер поднят — заходи и не шуми.");
    }
}
