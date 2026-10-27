package ru.nochfonarey.mc;

import net.kyori.adventure.key.Key;
import net.kyori.adventure.sound.Sound;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import net.minestom.server.MinecraftServer;
import net.minestom.server.coordinate.BlockVec;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.entity.Player;
import net.minestom.server.instance.InstanceContainer;
import net.minestom.server.instance.block.Block;
import net.minestom.server.network.packet.server.play.ParticlePacket;
import net.minestom.server.particle.Particle;
import ru.nochfonarey.core.Host;
import ru.nochfonarey.core.P;
import ru.nochfonarey.core.Room;
import ru.nochfonarey.core.Tone;

import java.time.Duration;
import java.util.Collection;
import java.util.HashMap;
import java.util.Map;

/** Мост между ядром и Minecraft: блоки, звуки, частицы, свет, титулы, телепорты. */
public final class NetHost implements Host {

    private static final int WORLD_FLOOR = 63;
    /** Ноги игрока: пол режимов ставится на Y-1. */
    public static final double Y = 65;

    private InstanceContainer world;
    private final Map<String, Player> players = new HashMap<>();
    private final Map<String, BlockVec> followLights = new HashMap<>();

    /** Куда ставить «живой» свет (фонарь в руке). */
    public int followY = 67;
    public double spawnX = 0, spawnZ = 0;
    public Runnable onReady = () -> { };
    public Room room;

    public NetHost() {
        this.world = Worlds.create();
    }

    public InstanceContainer world() {
        return world;
    }

    public Collection<Player> players() {
        return players.values();
    }

    public Player player(String id) {
        return players.get(id);
    }

    /* ---------------- игроки ---------------- */

    public void add(Player player, P p) {
        players.put(p.id, player);
        player.setGameMode(net.minestom.server.entity.GameMode.ADVENTURE);
        player.getInventory().clear();
        player.setInstance(world, new Pos(p.x, Y, p.z, p.yaw, 0f));
    }

    public void remove(Player player) {
        players.values().remove(player);
    }

    public void teleportAll() {
        if (room == null) return;
        for (P p : room.players.values()) {
            Player pl = players.get(p.id);
            if (pl == null) continue;
            Pos pos = new Pos(p.x, Y, p.z, p.yaw, 0f);
            if (pl.getInstance() != world) {
                pl.setInstance(world, pos);
            } else {
                pl.teleport(pos);
            }
            pl.setRespawnPoint(pos);
        }
        // тени/пленники двигаются только через игру
        for (P p : room.players.values()) {
            Player pl = players.get(p.id);
            if (pl == null) continue;
            pl.setGameMode(p.spectator || !p.alive
                    ? net.minestom.server.entity.GameMode.SPECTATOR
                    : net.minestom.server.entity.GameMode.ADVENTURE);
        }
    }

    /** Новый чистый мир: старый раунд не оставляет горящих костров на площадке. */
    public void newWorld() {
        InstanceContainer next = Worlds.create();
        InstanceContainer old = world;
        for (Player pl : players.values()) {
            pl.setInstance(next, new Pos(spawnX, Y, spawnZ));
        }
        world = next;
        followLights.clear();
        if (old != null) MinecraftServer.getInstanceManager().unregisterInstance(old);
    }

    /* ---------------- Host ---------------- */

    @Override
    public void chat(P p, String text, Tone tone) {
        NamedTextColor color = switch (tone) {
            case INFO -> NamedTextColor.GRAY;
            case WARN -> NamedTextColor.GOLD;
            case GOOD -> NamedTextColor.GREEN;
            case DARK -> NamedTextColor.DARK_RED;
        };
        Component msg = Component.text("✦ ", NamedTextColor.DARK_GRAY)
                .append(Component.text(text, color));
        if (p == null) {
            for (Player pl : players.values()) pl.sendMessage(msg);
        } else {
            Player pl = players.get(p.id);
            if (pl != null) pl.sendMessage(msg);
        }
    }

    @Override
    public void title(P p, String big, String small) {
        Player pl = players.get(p.id);
        if (pl == null) return;
        Title title = Title.title(
                Component.text(big, NamedTextColor.DARK_RED),
                Component.text(small, NamedTextColor.GRAY),
                Title.Times.times(Duration.ofMillis(300), Duration.ofSeconds(3), Duration.ofMillis(800)));
        pl.showTitle(title);
    }

    @Override
    public void sound(P p, String key, float volume, float pitch) {
        Player pl = players.get(p.id);
        if (pl == null) return;
        pl.playSound(sound(key, volume, pitch));
    }

    @Override
    public void soundAt(double x, double z, String key, float volume, float pitch) {
        Sound sound = sound(key, volume, pitch);
        for (Player pl : players.values()) {
            Pos pos = pl.getPosition();
            double dx = pos.x() - x, dz = pos.z() - z;
            if (dx * dx + dz * dz > 48 * 48) continue;
            pl.playSound(sound, x, Y, z);
        }
    }

    private static Sound sound(String key, float volume, float pitch) {
        String id = key.startsWith("minecraft:") ? key : "minecraft:" + key;
        return Sound.sound(Key.key(id), Sound.Source.MASTER, volume, pitch);
    }

    @Override
    public void particle(String key, double x, double y, double z, int count, double spread) {
        String id = key.startsWith("minecraft:") ? key : "minecraft:" + key;
        Particle particle;
        try {
            particle = Particle.fromKey(id);
        } catch (RuntimeException e) {
            return;
        }
        if (particle == null) return;
        float s = (float) Math.max(0, spread);
        ParticlePacket packet = new ParticlePacket(particle,
                x, y, z, s, s, s, 0.02f, Math.max(1, count));
        for (Player pl : players.values()) {
            Pos pos = pl.getPosition();
            double dx = pos.x() - x, dz = pos.z() - z;
            if (dx * dx + dz * dz > 64 * 64) continue;
            pl.sendPacket(packet);
        }
    }

    @Override
    public void block(int x, int y, int z, String key) {
        if (y < -64 || y > 300) return;
        world.setBlock(x, y, z, BlockMap.get(key));
    }

    @Override
    public void light(int x, int y, int z, int level) {
        if (level <= 0) {
            world.setBlock(x, y, z, Block.AIR);
        } else {
            world.setBlock(x, y, z, BlockMap.light(level));
        }
    }

    @Override
    public void followLight(String id, double x, double z, int level) {
        BlockVec prev = followLights.get(id);
        if (level <= 0) {
            if (prev != null) {
                world.setBlock((int) prev.x(), (int) prev.y(), (int) prev.z(), Block.AIR);
                followLights.remove(id);
            }
            return;
        }
        BlockVec now = new BlockVec((int) Math.round(x), followY, (int) Math.round(z));
        if (prev != null && prev.x() == now.x() && prev.y() == now.y() && prev.z() == now.z()) return;
        if (prev != null) world.setBlock((int) prev.x(), (int) prev.y(), (int) prev.z(), Block.AIR);
        world.setBlock((int) now.x(), (int) now.y(), (int) now.z(), BlockMap.light(level));
        followLights.put(id, now);
    }

    @Override
    public void ready() {
        teleportAll();
        onReady.run();
    }

    public static int floorY() {
        return WORLD_FLOOR;
    }
}
