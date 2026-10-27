package net.minestom.server.item;
import net.kyori.adventure.text.Component;
public interface ItemStack {
    static ItemStack of(Material material) { return null; }
    static ItemStack of(Material material, int amount) { return null; }
    ItemStack withCustomName(Component name);
    ItemStack withLore(Component... lore);
}
