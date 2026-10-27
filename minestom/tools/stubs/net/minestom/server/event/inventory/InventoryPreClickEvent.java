package net.minestom.server.event.inventory;
import net.minestom.server.entity.Player;
public class InventoryPreClickEvent {
    public Player getPlayer() { return null; }
    public int getSlot() { return 0; }
    public net.minestom.server.inventory.AbstractInventory getInventory() { return null; }
    public void setCancelled(boolean cancel) { }
}
