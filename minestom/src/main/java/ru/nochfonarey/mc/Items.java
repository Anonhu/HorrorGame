package ru.nochfonarey.mc;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.item.ItemStack;
import net.minestom.server.item.Material;

/** Предметы в руках: чисто визуальные, вся механика — по Shift и ПКМ. */
public final class Items {

    private Items() {
    }

    public static ItemStack of(String id, String name, NamedTextColor color) {
        Material material = Material.fromKey(id);
        if (material == null) material = Material.STONE;
        return ItemStack.of(material)
                .withCustomName(Component.text(name, color))
                .withLore(Component.text("Хэллоуин · Minestom", NamedTextColor.DARK_GRAY));
    }

    public static ItemStack withLore(ItemStack stack, String... lines) {
        Component[] lore = new Component[lines.length];
        for (int i = 0; i < lines.length; i++) {
            lore[i] = Component.text(lines[i], NamedTextColor.GRAY);
        }
        return stack.withLore(lore);
    }

    public static ItemStack lantern() {
        return of("minecraft:lantern", "Фонарь", NamedTextColor.GOLD);
    }

    public static ItemStack soulLantern() {
        return of("minecraft:soul_lantern", "Фонарь", NamedTextColor.AQUA);
    }

    public static ItemStack candle() {
        return of("minecraft:candle", "Свеча", NamedTextColor.YELLOW);
    }

    /**
     * Единственный предмет лобби. Раньше здесь лежал {@code recovery_compass} —
     * у него своя механика «вернуться к месту смерти», и в руках в режиме
     * приключения он может отработать на клиенте вместо нашего меню.
     * Обычный компас — чистый предмет без ванильного поведения.
     */
    public static ItemStack compass() {
        Material material = Material.fromKey("minecraft:compass");
        if (material == null) material = Material.STONE;
        return ItemStack.of(material)
                .withCustomName(Component.text("Меню режимов", NamedTextColor.LIGHT_PURPLE))
                .withLore(Component.text("ПКМ или F — выбрать игру", NamedTextColor.GRAY),
                        Component.text("Хэллоуин · Minestom", NamedTextColor.DARK_GRAY));
    }

    public static ItemStack menuLantern() {
        return withLore(of("minecraft:campfire", "ФОНАРЩИКИ", NamedTextColor.GOLD),
                "4–8 игроков · держать костры до рассвета",
                "ПКМ — создать комнату");
    }

    public static ItemStack menuRelay() {
        return withLore(of("minecraft:beacon", "ЭСТАФЕТА СВЕТА", NamedTextColor.AQUA),
                "4–10 игроков · донести фонарь до часовни",
                "ПКМ — создать комнату");
    }

    public static ItemStack menuInn() {
        return withLore(of("minecraft:dark_oak_door", "ПОСТОЯЛЫЙ ДВОР", NamedTextColor.RED),
                "5–16 игроков · найти «не гостя»",
                "ПКМ — создать комнату");
    }

    public static ItemStack skull(String name) {
        return of("minecraft:player_head", name, NamedTextColor.WHITE);
    }
}
