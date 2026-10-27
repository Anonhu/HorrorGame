package ru.leshorror;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.text.format.TextDecoration;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.entity.GameMode;
import net.minestom.server.entity.Player;
import net.minestom.server.event.EventNode;
import net.minestom.server.event.player.AsyncPlayerConfigurationEvent;
import net.minestom.server.event.player.PlayerDisconnectEvent;
import net.minestom.server.event.player.PlayerSpawnEvent;
import net.minestom.server.event.player.PlayerStartSprintingEvent;
import net.minestom.server.event.player.PlayerStopSprintingEvent;
import net.minestom.server.event.player.PlayerUseItemEvent;
import net.minestom.server.instance.Instance;
import net.minestom.server.item.ItemStack;
import net.minestom.server.item.Material;
import net.minestom.server.network.packet.server.play.ParticlePacket;
import net.minestom.server.particle.Particles;
import net.minestom.server.timer.TaskSchedule;
import ru.leshorror.game.Session;
import ru.leshorror.game.SessionManager;
import ru.leshorror.game.StagHollow;
import ru.leshorror.world.LesWorld;
import ru.leshorror.world.Palette;

import java.util.HashMap;
import java.util.Map;

/**
 * Events: join/spawn, the echo ping (right click), sprint noise and the
 * per-tick ping particles. Everything gameplay-related is delegated to
 * {@link Session} and {@link StagHollow}.
 */
public final class LesListener {
    private final LesWorld world;
    private final SessionManager sessions;
    private final StagHollow stag;
    private final Map<Player, Long> lastPing = new HashMap<>();

    public LesListener(LesWorld world, SessionManager sessions, StagHollow stag) {
        this.world = world;
        this.sessions = sessions;
        this.stag = stag;
    }

    public void register(EventNode<net.minestom.server.event.Event> node) {
        node.addListener(AsyncPlayerConfigurationEvent.class, event -> {
            Player player = event.getPlayer();
            event.setSpawningInstance(world.instance());
            player.setRespawnPoint(new Pos(0.5, LesWorld.SPAWN_Y + 1, 4.5, 180f, 0f));
        });

        node.addListener(PlayerSpawnEvent.class, event -> {
            if (!event.isFirstSpawn()) return;
            Player player = event.getPlayer();
            player.setGameMode(GameMode.ADVENTURE);
            player.setFlying(false);
            player.setAllowFlying(false);
            player.setSneaking(false);

            // the bone lantern: right click = echo pulse
            player.getInventory().setItemStack(4, ItemStack.of(Material.JACK_O_LANTERN)
                    .withDisplayName(Component.text("Костяной фонарь", NamedTextColor.GOLD)
                            .decoration(TextDecoration.ITALIC, false))
                    .withLore(java.util.List.of(
                            Palette.whisper("ПКМ — эхо-импульс"),
                            Palette.dim("шум +30 · оглушает его"))));

            Session session = sessions.join(player);
            session.reset(world.instance());
            stag.spawnNear(player.getPosition().x(), player.getPosition().z());

            player.sendMessage(Component.empty());
            player.sendMessage(Component.text("ЛЕС СЛУШАЕТ", NamedTextColor.GOLD)
                    .decorate(TextDecoration.BOLD));
            player.sendMessage(Component.text("Хэллоуин · Wilderness Bound 26.3", NamedTextColor.DARK_GRAY));
            player.sendMessage(Palette.whisper("Не беги. Оно слышит шаги."));
            player.sendMessage(Palette.whisper("Смотри на него — но не дольше трёх секунд."));
            player.sendMessage(Palette.ritual("Зажги четыре тотема и вернись к кругу."));
            player.sendMessage(Component.empty());
        });

        node.addListener(PlayerUseItemEvent.class, event -> {
            Player player = event.getPlayer();
            Session session = sessions.get(player);
            if (session == null || session.finished()) return;
            long now = System.currentTimeMillis();
            long last = lastPing.getOrDefault(player, 0L);
            if (now - last < 2000) {
                player.sendActionBar(Palette.dim("эхо ещё не готово"));
                return;
            }
            lastPing.put(player, now);
            session.attack();
            echoPulse(player);
            boolean hit = stag.pingHit(player);
            if (hit) {
                player.sendActionBar(Component.text("ЭХО ПОПАЛО · ОНО ЗАМЕРЛО", NamedTextColor.AQUA));
            }
        });

        node.addListener(PlayerStartSprintingEvent.class, event -> {
            Session s = sessions.get(event.getPlayer());
            if (s != null) {
                event.getPlayer().sendActionBar(Palette.warn("слишком громко"));
            }
        });

        node.addListener(PlayerStopSprintingEvent.class, event -> {
            Session s = sessions.get(event.getPlayer());
            if (s != null) event.getPlayer().sendActionBar(Palette.dim("тише…"));
        });

        node.addListener(PlayerDisconnectEvent.class, event -> {
            sessions.leave(event.getPlayer());
            lastPing.remove(event.getPlayer());
        });

        // one fear-pulse per second per player
        net.minestom.server.MinecraftServer.getSchedulerManager()
                .buildTask(() -> {
                    for (Session s : sessions.activeSessions()) {
                        Player p = s.player();
                        if (!p.isOnline()) continue;
                        double d = stag.distanceTo(p);
                        if (d < 24 && !stag.dormant()) {
                            p.sendPacket(new ParticlePacket(Particles.CRIMSON_SPORE, true, true,
                                    p.getPosition().x(), p.getPosition().y() + 1, p.getPosition().z(),
                                    3f, 1f, 3f, 0f, 2));
                        }
                        // keep the stag entity spawned for whoever can see it
                        if (!stag.dormant() && d < 60 && stag.entity().getInstance() == null) {
                            stag.entity().setInstance(world.instance(), stag.position());
                        }
                        if (stag.dormant() && stag.entity().getInstance() != null) {
                            stag.entity().remove();
                        }
                    }
                })
                .repeat(TaskSchedule.seconds(1))
                .schedule();
    }

    /** the sonar: a ring of particles expanding around the player */
    private void echoPulse(Player player) {
        Pos p = player.getPosition();
        Instance instance = player.getInstance();
        if (instance == null) return;
        player.playSound(net.kyori.adventure.sound.Sound.sound(
                net.kyori.adventure.key.Key.key("minecraft", "block.amethyst_block.resonate"),
                net.kyori.adventure.sound.Sound.Source.PLAYER, 1.4f, 1.2f), net.kyori.adventure.sound.Sound.Emitter.self());

        for (int ring = 0; ring < 3; ring++) {
            double radius = 3 + ring * 5;
            int count = 12 + ring * 8;
            net.minestom.server.MinecraftServer.getSchedulerManager()
                    .buildTask(() -> {
                        for (int i = 0; i < count; i++) {
                            double a = i / (double) count * Math.PI * 2;
                            double x = p.x() + Math.cos(a) * radius;
                            double z = p.z() + Math.sin(a) * radius;
                            player.sendPacket(new ParticlePacket(Particles.END_ROD, true, true,
                                    x, p.y() + 0.2, z, 0.05f, 0.35f, 0.05f, 0.01f, 1));
                        }
                        // the stag gets an outline scan if it is close
                        double sd = stag.distanceTo(player);
                        if (!stag.dormant() && sd < 44) {
                            player.sendPacket(new ParticlePacket(Particles.SOUL, true, true,
                                    stag.position().x(), stag.position().y() + 3, stag.position().z(),
                                    1.6f, 2.4f, 1.6f, 0.01f, 40));
                        }
                    })
                    .delay(TaskSchedule.millis(ring * 120L))
                    .schedule();
        }
    }
}
