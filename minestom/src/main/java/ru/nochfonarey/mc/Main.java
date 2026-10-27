package ru.nochfonarey.mc;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.Auth;
import net.minestom.server.MinecraftServer;
import net.minestom.server.event.server.ServerListPingEvent;
import net.minestom.server.ping.Status;
import net.minestom.server.timer.Task;
import net.minestom.server.utils.time.TimeUnit;

/**
 * ТРИ НОЧИ — сервер на Minestom 26.3 (Minecraft Java 26.3, Java 25).
 *
 * Порт: 25565 или переменная окружения PORT.
 * Онлайн-режим выключен: заходите с любого пиратского/оффлайн-клиента 26.3.
 */
public final class Main {

    public static void main(String[] args) {
        int port = 25565;
        String env = System.getenv("PORT");
        if (env != null && !env.isBlank()) {
            try {
                port = Integer.parseInt(env.trim());
            } catch (NumberFormatException ignored) {
                // остаёмся на 25565
            }
        }

        MinecraftServer server = MinecraftServer.init(new Auth.Offline());
        MinecraftServer.setCompressionThreshold(0);

        Hub hub = new Hub();
        MinecraftServer.getCommandManager().register(new Cmd(hub));
        Interact.register(hub);

        MinecraftServer.getGlobalEventHandler().addListener(ServerListPingEvent.class, event ->
                event.setStatus(Status.builder()
                        .description(Component.text("ХЭЛЛОУИН · ТРИ НОЧИ", NamedTextColor.DARK_RED)
                                .append(Component.newline())
                                .append(Component.text("Фонарщики · Эстафета света · Постоялый двор",
                                        NamedTextColor.GRAY)))
                        .build()));

        Task task = MinecraftServer.getSchedulerManager()
                .buildTask(hub::tick)
                .repeat(1, TimeUnit.SERVER_TICK)
                .schedule();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            task.cancel();
            hub.shutdown();
            MinecraftServer.stopCleanly();
        }, "halloween-shutdown"));

        server.start("0.0.0.0", port);
        System.out.println("──────────────────────────────────────────────");
        System.out.println("  ТРИ НОЧИ · Minestom 26.3 · порт " + port);
        System.out.println("  /h create lantern|relay|inn   /h join КОД   /h start");
        System.out.println("──────────────────────────────────────────────");
    }
}
