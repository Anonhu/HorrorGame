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
import ru.nochfonarey.core.Lobby;
import ru.nochfonarey.core.Mode;
import ru.nochfonarey.core.ModeType;
import ru.nochfonarey.core.P;
import ru.nochfonarey.core.RelayMode;
import ru.nochfonarey.core.Room;
import ru.nochfonarey.core.RoomLobby;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Все комнаты сервера: лобби, вход по коду, тик 20 Гц, HUD. */
public final class Hub {

    /** Южный край площади, лицом к центральному костру. */
    public static final Pos LOBBY = new Pos(Lobby.SPAWN_X, Lobby.FLOOR + 1,
            Lobby.SPAWN_Z, Lobby.SPAWN_YAW, 0f);
    public static final double DT = 1.0 / 20.0;
    /**
     * Ниже этой высоты — уже пустота: пол лобби 63, пол арен 64, подвал двора
     * там же. Всё, что ниже, — падение, и игрока возвращают на спавн.
     */
    public static final double VOID_Y = 45;

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
    /** Кому уже показали меню режимов после входа в лобби. */
    private final Set<UUID> menuOffered = new HashSet<>();
    private final java.util.concurrent.CopyOnWriteArrayList<Runnable> deferred =
            new java.util.concurrent.CopyOnWriteArrayList<>();
    private long ticks = 0;

    public Hub() {
        I = this;
        lobby = Worlds.create();
        Lobby.build(new McBlueprint(lobby));
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

        // комната ожидания, а не пустой каменный мир
        RoomLobby.build(new McBlueprint(host.world()), modeKey(type));
        host.spawnX = 0;
        host.spawnZ = 0;
        host.followY = RoomLobby.Y + 3;

        hostOf.put(player.getUuid(), host);
        roomOf.put(player.getUuid(), room);
        P created = room.players.get(player.getUuid().toString());
        created.x = 0;
        created.z = 0;
        created.yaw = 180f;
        host.add(player, created);
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
        p.x = 0;
        p.z = 0;
        p.yaw = 180f;
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
            prepare(player, GameMode.ADVENTURE);
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
        double[] centre = arenaCenter(room.type);
        host.spawnX = centre[0];
        host.spawnZ = centre[1];
        host.followY = (int) NetHost.Y + 2;
        // пустой мир: арену строим ДО того, как перенести людей
        host.beginWorld();
        boolean ok;
        try {
            ok = room.start();
        } catch (RuntimeException e) {
            System.err.println("[room " + room.code + "] арена не построилась: " + e);
            e.printStackTrace();
            ok = false;
        }
        if (!ok) {
            // откат: обратно в комнату ожидания, а не в пустой мир
            toWaitingRoom(room);
            by.sendMessage(Component.text("Не вышло начать раунд — вернул всех в комнату.", NamedTextColor.RED));
            return false;
        }
        // доказательство, что карта на месте: считаем, что и правда стоит в мире
        int built = host.countBlocks();
        System.out.println("[arena] " + room.type + ": " + built + " блоков, спавн ("
                + (int) host.spawnX + "," + (int) host.spawnZ + ")");
        by.sendMessage(Component.text("Арена " + titleOf(room.type) + " построена: "
                + built + " блоков.", NamedTextColor.DARK_GRAY));
        if (built < 500) {
            // карта не построилась: лучше вернуть всех в комнату, чем оставить в пустоте
            System.err.println("[arena] карта не построилась: " + built + " блоков — откат");
            toWaitingRoom(room);
            by.sendMessage(Component.text("Карта не построилась — вернул всех в комнату ожидания."
                    + " Подробности в консоли сервера.", NamedTextColor.RED));
            return false;
        }
        // у всех чистое состояние: прошлый раунд не оставляет ни предметов, ни огня
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;
            prepare(pl, GameMode.ADVENTURE);
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
        toWaitingRoom(room);
        for (P p : room.players.values()) {
            Player pl = ((NetHost) room.host).player(p.id);
            if (pl == null) continue;
            pl.sendMessage(Component.text("Комната сброшена. /h start — новый раунд.", NamedTextColor.GOLD));
        }
    }

    /**
     * Вернуть комнату в комнату ожидания: свежий мир, свежая площадка,
     * у всех пустой инвентарь и лобби-набор. Используется и после раунда,
     * и при откате неудачного старта.
     */
    private void toWaitingRoom(Room room) {
        NetHost host = (NetHost) room.host;
        host.spawnX = 0;
        host.spawnZ = 0;
        host.followY = RoomLobby.Y + 3;
        host.beginWorld();
        RoomLobby.build(new McBlueprint(host.world()), modeKey(room.type));
        room.reset();
        for (P p : room.players.values()) {
            p.x = 0;
            p.z = 0;
            p.yaw = 180f;
            wasDead.remove(p.id);
        }
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;
            Hud hud = hudOf.remove(pl.getUuid());
            if (hud != null) hud.close();
        }
        host.moveIn();
        for (P p : room.players.values()) {
            Player pl = host.player(p.id);
            if (pl == null) continue;
            prepare(pl, GameMode.ADVENTURE);
            giveLobbyKit(pl);
        }
    }

    /**
     * Чистое состояние игрока: ни предметов, ни огня, ни голода, ни эффектов
     * от прошлой игры. Раньше предметы переезжали из раунда в раунд.
     */
    public static void prepare(Player player, GameMode mode) {
        player.getInventory().clear();
        player.setHealth(20f);
        player.setFood(20);
        player.setFoodSaturation(5f);
        player.setFireTicks(0);
        player.setLevel(0);
        player.setExp(0f);
        player.clearEffects();
        player.setGameMode(mode);
    }

    /** Ключ режима для RoomLobby — тот же язык, что в /h create. */
    static String modeKey(ModeType type) {
        return switch (type) {
            case LANTERN -> "lantern";
            case RELAY -> "relay";
            case INN -> "inn";
        };
    }

    /** Куда ставить игроков в момент пересоздания мира перед стартом раунда. */
    private static double[] arenaCenter(ModeType type) {
        return switch (type) {
            case LANTERN -> new double[]{36, 36};
            case RELAY -> new double[]{8, 32};
            case INN -> new double[]{21, 20};
        };
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

    /**
     * Инвентарь лобби: один предмет и ноль загадок.
     *
     * <p>Раньше в слотах 4–6 лежали предметы трёх режимов — человек видел
     * в инвентаре «чужие» вещи и не понимал, что нажимать. Теперь в руках
     * ровно один компас «Меню режимов»: ПКМ или F открывают меню, а пункты
     * меню уже создают комнату.
     */
    public static void giveLobbyKit(Player player) {
        player.getInventory().clear();
        player.getInventory().setItemStack(0, Items.compass());
        player.refreshHeldSlot((byte) 0);
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

    /** Отложить действие до ближайшего тика (безопасно для инвентарей и телепортов). */
    public void defer(Runnable action) {
        deferred.add(action);
    }

    public void tick() {
        ticks++;
        if (!deferred.isEmpty()) {
            List<Runnable> now = new ArrayList<>(deferred);
            deferred.clear();
            for (Runnable r : now) {
                try {
                    r.run();
                } catch (RuntimeException e) {
                    System.err.println("[defer] " + e);
                }
            }
        }
        Ambience.lobby(lobbyWatchers(), ticks);
        guard();
        offerMenu();
        autoResetEnded();
        NetHost.sweepRetired();
        for (GameServer gs : new ArrayList<>(servers)) {
            // ввод со стороны Minecraft — по разу на комнату
            for (Room room : new ArrayList<>(gs.rooms)) {
                try {
                    syncInput(room, (NetHost) room.host);
                } catch (RuntimeException e) {
                    System.err.println("[room " + room.code + "] ввод: " + e);
                }
            }
            // часы комнат двигаются ровно один раз за тик, а не по разу на комнату
            try {
                gs.tick(DT);
            } catch (RuntimeException e) {
                System.err.println("[tick] " + e);
                e.printStackTrace();
            }
            for (Room room : new ArrayList<>(gs.rooms)) {
                try {
                    afterTick(room, (NetHost) room.host);
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

    /**
     * Меню режимов показывается само при входе в лобби — один раз на игрока.
     *
     * <p>Так «предмет меню не работает» перестаёт быть проблемой: даже если
     * игрок не догадается нажать ПКМ, он всё равно увидит три режима и сможет
     * выбрать. Повторно меню открывается компасом, клавишей F и командой
     * {@code /h menu}.
     */
    private void offerMenu() {
        for (Player pl : MinecraftServer.getConnectionManager().getOnlinePlayers()) {
            if (pl.getInstance() != lobby) {
                menuOffered.remove(pl.getUuid());
                continue;
            }
            if (pl.getOpenInventory() != null) {
                menuOffered.add(pl.getUuid());
                continue;
            }
            if (menuOffered.add(pl.getUuid())) {
                Interact.openMenu(this, pl);
            }
        }
    }

    /**
     * Пустота и границы.
     *
     * <p>Лобби и комнаты висят в пустом мире, поэтому сойти с площадки нельзя:
     * по кромке стоит невидимая стена, а если игрок всё-таки оказался ниже
     * {@link #VOID_Y} (провалился, телепортнулся, застрял) — его возвращает
     * на спавн: в комнате — на спавн арены, без комнаты — на площадь.
     */
    private void guard() {
        for (Player pl : MinecraftServer.getConnectionManager().getOnlinePlayers()) {
            Pos pos = pl.getPosition();
            boolean inLobby = pl.getInstance() == lobby;
            NetHost host = hostOf.get(pl.getUuid());
            boolean fell = pos.y() < VOID_Y;
            double dx = pos.x() - Lobby.CX, dz = pos.z() - Lobby.CZ;
            boolean escaped = inLobby && Math.hypot(dx, dz) > Lobby.WALL_R + 3.5;
            // мир комнаты пересоздали, а игрок остался в старом (например, не дождался
            // переезда) — вернём его в актуальный мир комнаты
            boolean lost = host != null && !inLobby && pl.getInstance() != host.world();
            if (!fell && !escaped && !lost) continue;

            if (inLobby || host == null) {
                // площадь: полный сброс, человек только что был в пустоте
                prepare(pl, GameMode.ADVENTURE);
                pl.setInstance(lobby, LOBBY);
                pl.setRespawnPoint(LOBBY);
                giveLobbyKit(pl);
                pl.sendMessage(Component.text(escaped
                        ? "Дальше пустота. Площадь кончается у стены."
                        : "Пустота не отпускает — ты снова на площади.",
                        NamedTextColor.DARK_GRAY));
            } else {
                // арена: возвращаем на спавн и не трогаем роль — призрак остаётся призраком
                Pos spawn = host.spawnPos();
                if (pl.getInstance() != host.world()) {
                    pl.setInstance(host.world(), spawn);
                } else {
                    pl.teleport(spawn);
                }
                pl.sendMessage(Component.text("Пустота вернула тебя на арену.", NamedTextColor.DARK_GRAY));
            }
        }
    }

    /** Раунд кончился — через {@link Room#endAt} возвращаем всех в комнату ожидания. */
    private void autoResetEnded() {
        double now = System.currentTimeMillis() / 1000.0;
        for (GameServer gs : servers) {
            for (Room room : new ArrayList<>(gs.rooms)) {
                if (room.phase != Room.Phase.END || room.endAt <= 0 || now < room.endAt) continue;
                toWaitingRoom(room);
                for (P p : room.players.values()) {
                    Player pl = ((NetHost) room.host).player(p.id);
                    if (pl != null) {
                        pl.sendMessage(Component.text("Ночь кончилась. /h start — ещё раз.",
                                NamedTextColor.GOLD));
                    }
                }
            }
        }
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

    /** Кто сейчас стоит на площади (а не в мире своей комнаты). */
    private java.util.List<Player> lobbyWatchers() {
        java.util.List<Player> out = new ArrayList<>();
        for (Player pl : MinecraftServer.getConnectionManager().getOnlinePlayers()) {
            if (pl.getInstance() == lobby) out.add(pl);
        }
        return out;
    }

    public void shutdown() {
        for (GameServer gs : servers) gs.rooms.clear();
    }
}
