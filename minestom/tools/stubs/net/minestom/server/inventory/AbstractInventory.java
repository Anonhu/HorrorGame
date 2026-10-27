package net.minestom.server.inventory;
import net.minestom.server.item.ItemStack;
public abstract class AbstractInventory {
    public void setItemStack(int slot, ItemStack itemStack) { }
    public synchronized void clear() { }
}
