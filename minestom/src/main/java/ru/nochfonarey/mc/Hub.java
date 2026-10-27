package ru.nochfonarey.mc;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.MinecraftServer;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.entity.GameMode;
import net.minestom.server.entity.Player;
import net.minestom.server.instance.InstanceContainer;
import net.minestom.server.instance.block.Block;
import net.minestom.server.item.ItemStack;
import ru.nochfonarey.core.GameServer;
import ru.nochfonarey.core.InnMode;
import ru.nochfonarey.core.LanternMode;
import ru.nochfonarey.core.Mode;
import ru.nochfonarey.core.ModeType;
import ru.nochfonarey.core.P;
import ru.nochfonarey.core.RelayMode;
import ru.nochfonarey.core.Room;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Все комнаты сервера: лобби, вход по коду, тик 20 Гц, HUD. */
public final class Hub {

    public static final Pos LOBBY = new Pos(8.5, 65, 8.5, 180f, 0f);
    public static final double DT = 1.0 / 20.0;

    public static Hub I;

    /** Раздача PS1-пака; может быть null, если порт занят. */
    public PackServer packs;

    private final InstanceContainer lobby;
    private final List<GameServer> servers = new ArrayList<>();
    private final Map<UUID, NetHost> hostOf = new HashMap<>();
    private final Map<UUID, Room> roomOf = new HashMap<>();
    private final Map<UUID, Hud> hudOf = new HashMap<>();
    private final Map<String, Double> clickUntil = new HashMap<>();
    private final Map<UUID, String[]> voteSlots = new HashMap<>();
    private final Set<String> wasDead = new HashSet<>();
    private final Set<String> announced = new HashSet<>();
    private long ticks = 0;

    public Hub() {
        I = this;
        lobby = Worlds.create();
        buildLobby();
    }

    private void buildLobby() {
        for (int x = 0; x <= 17; x++) {
            for (int z = 0; z <= 17; z++) {
                lobby.setBlock(x, 63, z, Block.DEEPSLATE_TILES);
                lobby.setBlock(x, 64, z, Block.AIR);
                for (int y = 65; y <= 68; y++) lobby.setBlock(x, y, z, Block.AIR);
                boolean edge = x == 0 || x == 17 || z == 0 || z == 17;
                if (edge) {
                    for (int y = 64; y <= 65; y++) lobby.setBlock(x, y, z, Block.DARK_OAK_LOG);
                }
            }
        }
        int[][] fires = {{3, 3}, {14, 3}, {3, 14}, {14, 14}};
        for (int[] f : fires) {
            lobby.setBlock(f[0], 64, f[1], Block.CAMPFIRE);
            lobby.setBlock(f[0], 67, f[1], BlockMap.light(13));
        }
        lobby.setBlock(8, 64, 2, Block.LODESTONE);
        lobby.setBlock(8, 65, 2, BlockMap.light(14));
        lobby.setBlock(9, 64, 2, Block.LODESTONE);
    }

    public InstanceContainer lobby() {
        return lobby;
    }

    /* ---------------- комнаты ---------------- */

    public Room roomOf(Player player) {
        return roomOf.get(player.getUuid());
    }

    public NetHost hostOf(Player player) {
        return hostOf.get(player.getUuid());
    }

    public Room create(ModeType type, Player player) {
        leave(player, false);
        NetHost host = new NetHost();
        GameServer gs = new GameServer(host);
        Room room = gs.create(type, player.getUuid().toString(), player.getUsername());
        host.room = room;
        host.onReady = host::teleportAll;
        servers.add(gs);
        servers.removeIf(s -> s.rooms.isEmpty());

        hostOf.put(player.getUuid(), host);
        roomOf.put(player.getUuid(), room);
        host.add(player, room.players.get(player.getUuid().toString()));
        giveLobbyKit(player);
        host.teleportAll();

        player.sendMessage(Component.text("Комната " + room.code + " · " + type.title, NamedTextColor.GOLD));
        player.sendMessage(Component.text("Друзьям: /h join " + room.code, NamedTextColor.GRAY));
        player.sendMessage(Component.text("Когда все зашли — /h start", NamedTextColor.GRAY));
        return room;
    }

    public Room join(String code, Player player) {
        GameServer gs = null;
        Room target = null;
        for (GameServer s : servers) {
            Room r = s.byCode(code);
            if (r != null) {
                gs = s;
                target = r;
                break;
            }
        }
        if (gs == null || target == null) {
            player.sendMessage(Component.text("Комната " + code + " не найдена.", NamedTextColor.RED));
            return null;
        }
        if (target.phase != Room.Phase.LOBBY) {
            player.sendMessage(Component.text("Раунд уже идёт — попросите новый код.", NamedTextColor.RED));
            return null;
        }
        if (target.players.size() >= target.type.max) {
            player.sendMessage(Component.text("Комната заполнена.", NamedTextColor.RED));
            return null;
        }
        leave(player, false);
        NetHost host = (NetHost) target.host;
        P p = target.add(player.getUuid().toString(), player.getUsername());
        target.lastActivity = System.currentTimeMillis();
        hostOf.put(player.getUuid(), host);
        roomOf.put(player.getUuid(), target);
        host.add(player, p);
        giveLobbyKit(player);
        host.teleportAll();
        player.sendMessage(Component.text("Ты в комнате " + target.code + " · " + target.type.title, NamedTextColor.GOLD));
        return target;
    }

    public void leave(Player player, boolean toLobby) {
        Room room = roomOf.remove(player.getUuid());
        NetHost host = hostOf.remove(player.getUuid());
        Hud hud = hudOf.remove(player.getUuid());
        if (hud != null) hud.close();
        if (host != null) host.remove(player);
        if (room != null) room.remove(player.getUuid().toString());
        wasDead.remove(player.getUuid().toString());
        if (toLobby) {
            player.setGameMode(GameMode.ADVENTURE);
            player.getInventory().clear();
            player.setInstance(lobby, LOBBY);
            player.setRespawnPoint(LOBBY);
            giveLobbyKit(player);
        }
    }

    public boolean start(Room room, Player by) {
        if (room.phase != Room.Phase.LOBBY) {
            by.sendMessage(Component.text("Уже началось.", NamedTextColor.RED));
            return false;
        }
        NetHost host = (NetHost) room.host;
        host.newWorld();
        boolean ok = room.start();
        if (!ok) {
            by.sendMessage(Component.text("Не вышло начать раунд.", NamedTextColor.RED));
            return false;
        }
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;
            pl.setGameMode(GameMode.ADVENTURE);
            pl.getInventory().clear();
            pl.getInventory().setItemStack(0, itemFor(room.type, p));
            pl.getInventory().setItemStack(8, Items.compass());
            wasDead.remove(p.id);
            Hud hud = new Hud(pl, titleOf(room.type));
            Hud old = hudOf.put(pl.getUuid(), hud);
            if (old != null) old.close();
        }
        return true;
    }

    public void reset(Room room, Player by) {
        NetHost host = (NetHost) room.host;
        host.newWorld();
        room.reset();
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;
            pl.setGameMode(GameMode.ADVENTURE);
            pl.getInventory().clear();
            giveLobbyKit(pl);
            wasDead.remove(p.id);
            pl.sendMessage(Component.text("Комната сброшена. /h start — новый раунд.", NamedTextColor.GOLD));
        }
        host.spawnX = 8;
        host.spawnZ = 8;
    }

    private static String titleOf(ModeType type) {
        return switch (type) {
            case LANTERN -> "ФОНАРЩИКИ";
            case RELAY -> "ЭСТАФЕТА СВЕТА";
            case INN -> "ПОСТОЯЛЫЙ ДВОР";
        };
    }

    private static ItemStack itemFor(ModeType type, P p) {
        return switch (type) {
            case LANTERN -> p.impostor ? Items.soulLantern() : Items.lantern();
            case RELAY -> Items.lantern();
            case INN -> Items.candle();
        };
    }

    public static void giveLobbyKit(Player player) {
        player.getInventory().clear();
        player.getInventory().setItemStack(0, Items.compass());
        player.getInventory().setItemStack(4, Items.menuLantern());
        player.getInventory().setItemStack(5, Items.menuRelay());
        player.getInventory().setItemStack(6, Items.menuInn());
    }

    /* ---------------- клики и голосование ---------------- */

    public void press(Player player) {
        clickUntil.put(player.getUuid().toString(), now() + 0.55);
    }

    private boolean pressed(String id) {
        Double until = clickUntil.get(id);
        return until != null && until > now();
    }

    private static double now() {
        return System.currentTimeMillis() / 1000.0;
    }

    public void rememberVote(Player player, String[] slots) {
        voteSlots.put(player.getUuid(), slots);
    }

    public String voteTarget(Player player, int slot) {
        String[] slots = voteSlots.get(player.getUuid());
        if (slots == null || slot < 0 || slot >= slots.length) return null;
        return slots[slot];
    }

    /* ---------------- тик ---------------- */

    public void tick() {
        ticks++;
        for (GameServer gs : new ArrayList<>(servers)) {
            for (Room room : new ArrayList<>(gs.rooms)) {
                NetHost host = (NetHost) room.host;
                try {
                    syncInput(room, host);
                    gs.tick(DT);
                    afterTick(room, host);
                } catch (RuntimeException e) {
                    // один сломанный раунд не должен ронять сервер
                    System.err.println("[room " + room.code + "] " + e);
                    e.printStackTrace();
                }
            }
            gs.rooms.removeIf(r -> r.players.isEmpty());
        }
        servers.removeIf(s -> s.rooms.isEmpty());
    }

    private void syncInput(Room room, NetHost host) {
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;
            Pos pos = pl.getPosition();
            p.x = pos.x();
            p.z = pos.z();
            p.yaw = pos.yaw();
            if (room.phase != Room.Phase.PLAY) continue;
            Mode mode = room.mode;
            if (mode == null) continue;
            boolean act = pl.isSneaking() || pressed(p.id);
            if (act && p.alive) p.actUntil = mode.t + 0.3;
        }
    }

    private void afterTick(Room room, NetHost host) {
        if (room.phase == Room.Phase.LOBBY) announced.clear();
        Mode mode = room.mode;
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;

            // режим подвинул игрока (подвал, финал) — догоняем
            Pos pos = pl.getPosition();
            double dx = pos.x() - p.x, dz = pos.z() - p.z;
            if (dx * dx + dz * dz > 9) {
                pl.teleport(new Pos(p.x, NetHost.Y, p.z, p.yaw, 0f));
            }

            // смерть
            if (!p.alive && !wasDead.contains(p.id)) {
                wasDead.add(p.id);
                pl.setGameMode(GameMode.SPECTATOR);
                pl.sendMessage(Component.text("Ты больше не игрок — просто смотри.", NamedTextColor.DARK_GRAY));
            }
            if (p.alive && wasDead.contains(p.id) && room.phase == Room.Phase.LOBBY) {
                wasDead.remove(p.id);
                pl.setGameMode(GameMode.ADVENTURE);
            }

            // фонарь в руке двигает свет
            if (mode instanceof LanternMode m) {
                boolean lit = p.lanternOn && p.charge > 0 && p.alive;
                host.followLight(p.id, p.x, p.z, lit ? (p.charge > 50 ? 12 : 9) : 0);
                if (m.done) host.followLight(p.id, 0, 0, 0);
            } else if (mode instanceof RelayMode m) {
                boolean carrier = p.id.equals(m.carrierId);
                boolean lit = carrier && p.alive && !m.lanternOnGround;
                host.followLight("relay", p.x, p.z, lit ? 13 : 0);
                // у остальных — крошечный огонёк в руке, иначе экран чёрный
                host.followLight(p.id, p.x, p.z, (!p.alive || carrier) ? 0 : 5);
            }
        }

        // фонарь на земле / у алтаря горит сам
        if (mode instanceof RelayMode m && m.lanternOnGround) {
            host.followLight("ground", m.lanternX, m.lanternZ, 12);
        } else if (mode instanceof RelayMode) {
            host.followLight("ground", 0, 0, 0);
        }

        if (ticks % 4 == 0) {
            for (P p : room.players.values()) {
                Player pl = host.player(p.id);
                if (pl == null) continue;
                Hud hud = hudOf.get(pl.getUuid());
                if (hud == null) continue;
                hud.update(room, p);
            }
        }

        if (room.phase == Room.Phase.END) {
            for (P p : room.players.values()) {
                Player pl = host.player(p.id);
                if (pl == null) continue;
                if (announced.add(p.id)) {
                    pl.showTitle(net.kyori.adventure.title.Title.title(
                            Component.text("РАУНД ОКОНЧЕН", NamedTextColor.DARK_RED),
                            Component.text(room.summary, NamedTextColor.GRAY)));
                }
            }
        }
    }

    public void shutdown() {
        for (GameServer gs : servers) gs.rooms.clear();
    }
}
