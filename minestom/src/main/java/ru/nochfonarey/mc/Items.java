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

    public static ItemStack lantern() {
        return of("minecraft:lantern", "Фонарь", NamedTextColor.GOLD);
    }

    public static ItemStack soulLantern() {
        return of("minecraft:soul_lantern", "Фонарь", NamedTextColor.AQUA);
    }

    public static ItemStack candle() {
        return of("minecraft:candle", "Свеча", NamedTextColor.YELLOW);
    }

    public static ItemStack compass() {
        return of("minecraft:recovery_compass", "Меню", NamedTextColor.LIGHT_PURPLE);
    }

    public static ItemStack menuLantern() {
        return of("minecraft:campfire", "ФОНАРЩИКИ", NamedTextColor.GOLD);
    }

    public static ItemStack menuRelay() {
        return of("minecraft:beacon", "ЭСТАФЕТА СВЕТА", NamedTextColor.AQUA);
    }

    public static ItemStack menuInn() {
        return of("minecraft:dark_oak_door", "ПОСТОЯЛЫЙ ДВОР", NamedTextColor.RED);
    }

    public static ItemStack skull(String name) {
        return of("minecraft:player_head", name, NamedTextColor.WHITE);
    }
}
