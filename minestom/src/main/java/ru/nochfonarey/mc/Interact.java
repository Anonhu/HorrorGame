package ru.nochfonarey.mc;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.MinecraftServer;
import net.minestom.server.entity.Player;
import net.minestom.server.event.inventory.InventoryPreClickEvent;
import net.minestom.server.event.player.AsyncPlayerConfigurationEvent;
import net.minestom.server.event.player.PlayerBlockBreakEvent;
import net.minestom.server.event.player.PlayerBlockInteractEvent;
import net.minestom.server.event.player.PlayerBlockPlaceEvent;
import net.minestom.server.event.player.PlayerChatEvent;
import net.minestom.server.event.player.PlayerDisconnectEvent;
import net.minestom.server.event.player.PlayerSpawnEvent;
import net.minestom.server.event.player.PlayerSwapItemEvent;
import net.minestom.server.event.player.PlayerUseItemEvent;
import net.minestom.server.inventory.Inventory;
import net.minestom.server.inventory.InventoryType;
import ru.nochfonarey.core.InnMode;
import ru.nochfonarey.core.Mode;
import ru.nochfonarey.core.P;
import ru.nochfonarey.core.RelayMode;
import ru.nochfonarey.core.Room;

/** Все слушатели: вход, чат, ПКМ, Shift-действия, голосование в инвентаре. */
public final class Interact {

    private Interact() {
    }

    public static void register(Hub hub) {
        var events = MinecraftServer.getGlobalEventHandler();

        events.addListener(AsyncPlayerConfigurationEvent.class, event -> {
            event.setSpawningInstance(hub.lobby());
            Player player = event.getPlayer();
            player.setRespawnPoint(Hub.LOBBY);
        });

        events.addListener(PlayerSpawnEvent.class, event -> {
            if (!event.isFirstSpawn()) return;
            Player player = event.getPlayer();
            player.setGameMode(net.minestom.server.entity.GameMode.ADVENTURE);
            Hub.giveLobbyKit(player);
            greet(player);
        });

        events.addListener(PlayerDisconnectEvent.class, event ->
                hub.leave(event.getPlayer(), false));

        events.addListener(PlayerChatEvent.class, event -> {
            event.setCancelled(true);
            Player player = event.getPlayer();
            Room room = hub.roomOf(player);
            if (room == null) {
                player.sendMessage(Component.text("[лобби] " + player.getUsername() + ": " + event.getRawMessage(),
                        NamedTextColor.GRAY));
                return;
            }
            for (P p : room.players.values()) {
                Player other = ((NetHost) room.host).player(p.id);
                if (other == null) continue;
                other.sendMessage(Component.text(player.getUsername() + ": " + event.getRawMessage(),
                        NamedTextColor.WHITE));
            }
        });

        events.addListener(PlayerBlockBreakEvent.class, event -> event.setCancelled(true));
        events.addListener(PlayerBlockPlaceEvent.class, event -> event.setCancelled(true));

        events.addListener(PlayerBlockInteractEvent.class, event -> {
            Player player = event.getPlayer();
            event.setCancelled(true);
            event.setBlockingItemUse(true);
            handleClick(hub, player);
        });

        events.addListener(PlayerUseItemEvent.class, event -> handleClick(hub, event.getPlayer()));

        events.addListener(PlayerSwapItemEvent.class, event -> {
            event.setCancelled(true);
            Player player = event.getPlayer();
            Room room = hub.roomOf(player);
            if (room == null) {
                openMenu(hub, player);
                return;
            }
            if (room.phase != Room.Phase.PLAY || room.mode == null) return;
            String id = player.getUuid().toString();
            if (room.mode instanceof RelayMode) room.act(id, "pass", null);
            else if (room.mode instanceof InnMode) room.act(id, "shout", null);
            else room.act(id, "use", null);
        });

        events.addListener(InventoryPreClickEvent.class, event -> {
            Player player = event.getPlayer();
            // клики в своём инвентаре — не наши: иначе перенос предмета создаёт комнату
            if (event.getInventory() == player.getInventory()) return;
            event.setCancelled(true);
            Room room = hub.roomOf(player);
            if (room == null) {
                menuClick(hub, player, event.getSlot());
                return;
            }
            if (room.mode instanceof InnMode m && m.voteOpenNow()) {
                String target = hub.voteTarget(player, event.getSlot());
                if (target != null) {
                    room.act(player.getUuid().toString(), m.finalStage ? "finalVote" : "vote", target);
                    player.closeInventory();
                }
            }
        });
    }

    private static void handleClick(Hub hub, Player player) {
        Room room = hub.roomOf(player);
        if (room == null) {
            int slot = player.getHeldSlot();
            if (slot == 4) hub.create(ru.nochfonarey.core.ModeType.LANTERN, player);
            else if (slot == 5) hub.create(ru.nochfonarey.core.ModeType.RELAY, player);
            else if (slot == 6) hub.create(ru.nochfonarey.core.ModeType.INN, player);
            else openMenu(hub, player);
            return;
        }
        hub.press(player);
        Mode mode = room.mode;
        if (mode instanceof InnMode m && m.voteOpenNow()) openVote(hub, player, m);

    }

    /* ---------------- меню режимов ---------------- */

    public static void openMenu(Hub hub, Player player) {
        Inventory inv = new Inventory(InventoryType.CHEST_1_ROW,
                Component.text("ХЭЛЛОУИН · выбери режим", NamedTextColor.DARK_PURPLE));
        inv.setItemStack(2, Items.menuLantern());
        inv.setItemStack(4, Items.menuRelay());
        inv.setItemStack(6, Items.menuInn());
        String[] slots = new String[9];
        slots[2] = "lantern";
        slots[4] = "relay";
        slots[6] = "inn";
        hub.rememberVote(player, slots);
        player.openInventory(inv);
    }

    private static void menuClick(Hub hub, Player player, int slot) {
        switch (slot) {
            case 2 -> hub.create(ru.nochfonarey.core.ModeType.LANTERN, player);
            case 4 -> hub.create(ru.nochfonarey.core.ModeType.RELAY, player);
            case 6 -> hub.create(ru.nochfonarey.core.ModeType.INN, player);
            default -> {
            }
        }
    }

    /* ---------------- голосование ---------------- */

    public static void openVote(Hub hub, Player player, InnMode m) {
        Room room = hub.roomOf(player);
        if (room == null) return;
        Inventory inv = new Inventory(InventoryType.CHEST_3_ROW,
                Component.text(m.finalStage ? "КТО НЕ ГОСТЬ?" : "КОГО В ПОДВАЛ?", NamedTextColor.DARK_RED));
        String[] slots = new String[27];
        int i = 0;
        for (P p : room.players.values()) {
            if (!p.alive || p.id.equals(player.getUuid().toString())) continue;
            if (i >= 27) break;
            inv.setItemStack(i, Items.skull(p.name));
            slots[i] = p.id;
            if (p.impostor) {
                // подсказка не выдаётся — только владелец видит себя
            }
            i++;
        }
        hub.rememberVote(player, slots);
        player.openInventory(inv);
    }

    private static void greet(Player player) {
        player.sendMessage(Component.text(""));
        player.sendMessage(Component.text("  ХЭЛЛОУИН · ТРИ НОЧИ", NamedTextColor.DARK_RED));
        player.sendMessage(Component.text("  /h create lantern | relay | inn  — собрать комнату", NamedTextColor.GRAY));
        player.sendMessage(Component.text("  /h join КОД — зайти к друзьям   /h start — начать", NamedTextColor.GRAY));
        player.sendMessage(Component.text("  ПКМ по предмету в слоте 4-6 тоже создаёт комнату", NamedTextColor.DARK_GRAY));
        player.sendMessage(Component.text(""));
    }
}
