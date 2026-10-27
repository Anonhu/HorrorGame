package ru.nochfonarey.mc;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.command.builder.Command;
import net.minestom.server.command.builder.arguments.ArgumentType;
import net.minestom.server.command.builder.condition.Conditions;
import net.minestom.server.entity.Player;
import ru.nochfonarey.core.ModeType;
import ru.nochfonarey.core.P;
import ru.nochfonarey.core.Room;

/** /h — всё управление комнатой из чата. */
public final class Cmd extends Command {

    public Cmd(Hub hub) {
        super("h", "halloween", "триночи");
        setCondition(Conditions::playerOnly);
        setDefaultExecutor((sender, context) -> help((Player) sender));

        addSyntax((sender, context) -> help((Player) sender), ArgumentType.Literal("help"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            String raw = context.get("mode");
            ModeType type = ModeType.parse(raw);
            if (type == null) {
                player.sendMessage(Component.text("Режимы: lantern, relay, inn", NamedTextColor.RED));
                return;
            }
            hub.create(type, player);
        }, ArgumentType.Literal("create"), ArgumentType.Word("mode"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            hub.join(context.get("code"), player);
        }, ArgumentType.Literal("join"), ArgumentType.Word("code"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            Room room = hub.roomOf(player);
            if (room == null) {
                player.sendMessage(Component.text("Ты не в комнате. /h create lantern", NamedTextColor.RED));
                return;
            }
            if (!room.hostId.equals(player.getUuid().toString())) {
                player.sendMessage(Component.text("Начать может только хозяин комнаты.", NamedTextColor.RED));
                return;
            }
            int need = room.type.min;
            if (room.players.size() < need) {
                player.sendMessage(Component.text("Вас " + room.players.size() + ", для режима нужно от " + need
                        + ". Начинаем всё равно — на свой риск.", NamedTextColor.GOLD));
            }
            if (hub.start(room, player)) {
                for (P p : room.players.values()) {
                    Player other = ((NetHost) room.host).player(p.id);
                    if (other != null) {
                        other.sendMessage(Component.text("Раунд начался! Shift — действие, ПКМ — короткое действие.",
                                NamedTextColor.GOLD));
                    }
                }
            }
        }, ArgumentType.Literal("start"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            Room room = hub.roomOf(player);
            if (room == null) return;
            if (!room.hostId.equals(player.getUuid().toString())) {
                player.sendMessage(Component.text("Сбросить может только хозяин.", NamedTextColor.RED));
                return;
            }
            hub.reset(room, player);
        }, ArgumentType.Literal("reset"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            Room room = hub.roomOf(player);
            if (room == null) return;
            hub.leave(player, true);
            player.sendMessage(Component.text("Ты вышел из комнаты.", NamedTextColor.GRAY));
        }, ArgumentType.Literal("leave"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            Room room = hub.roomOf(player);
            if (room == null) {
                player.sendMessage(Component.text("Ты не в комнате.", NamedTextColor.RED));
                return;
            }
            player.sendMessage(Component.text("Код комнаты: " + room.code
                    + "  (/h join " + room.code + ")", NamedTextColor.GOLD));
            StringBuilder sb = new StringBuilder("Игроки: ");
            for (P p : room.players.values()) {
                sb.append(p.name).append(p.alive ? "" : "(выбыл)").append(", ");
            }
            player.sendMessage(Component.text(sb.toString(), NamedTextColor.GRAY));
        }, ArgumentType.Literal("code"));

        addSyntax((sender, context) -> {
            Player player = (Player) sender;
            Room room = hub.roomOf(player);
            if (room == null) return;
            String name = context.get("name");
            for (P p : room.players.values()) {
                if (p.name.equalsIgnoreCase(name) || p.name.toLowerCase().startsWith(name.toLowerCase())) {
                    room.act(player.getUuid().toString(),
                            room.mode instanceof ru.nochfonarey.core.InnMode m && m.finalStage ? "finalVote" : "vote",
                            p.id);
                    return;
                }
            }
            player.sendMessage(Component.text("Не нашёл такого игрока.", NamedTextColor.RED));
        }, ArgumentType.Literal("vote"), ArgumentType.Word("name"));
    }

    private static void help(Player player) {
        player.sendMessage(Component.text(" ХЭЛЛОУИН · команды", NamedTextColor.DARK_RED));
        player.sendMessage(Component.text("/h create lantern|relay|inn — новая комната", NamedTextColor.GRAY));
        player.sendMessage(Component.text("/h join КОД — зайти в комнату", NamedTextColor.GRAY));
        player.sendMessage(Component.text("/h start — начать (хозяин)", NamedTextColor.GRAY));
        player.sendMessage(Component.text("/h reset — сбросить (хозяин)", NamedTextColor.GRAY));
        player.sendMessage(Component.text("/h code — код и состав", NamedTextColor.GRAY));
        player.sendMessage(Component.text("/h vote ИМЯ — голос во дворе", NamedTextColor.GRAY));
        player.sendMessage(Component.text("/h leave — выйти", NamedTextColor.GRAY));
    }
}
