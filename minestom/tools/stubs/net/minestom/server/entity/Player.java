package net.minestom.server.entity;
import net.kyori.adventure.text.Component;
import net.kyori.adventure.title.Title;
import net.kyori.adventure.sound.Sound;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.instance.Instance;
import net.minestom.server.inventory.Inventory;
import net.minestom.server.inventory.PlayerInventory;
import net.minestom.server.item.ItemStack;
import net.minestom.server.network.packet.server.SendablePacket;
import java.util.UUID;
public class Player extends Entity {
    public UUID getUuid() { return null; }
    public String getUsername() { return null; }
    public void sendMessage(Component message) { }
    public void sendActionBar(Component message) { }
    public void showTitle(Title title) { }
    public void playSound(Sound sound) { }
    public void playSound(Sound sound, double x, double y, double z) { }
    public void sendPacket(SendablePacket packet) { }
    public boolean setGameMode(GameMode mode) { return true; }
    public GameMode getGameMode() { return null; }
    public PlayerInventory getInventory() { return null; }
    public byte getHeldSlot() { return 0; }
    public boolean openInventory(Inventory inventory) { return true; }
    public void closeInventory() { }
    public void setRespawnPoint(Pos pos) { }
    public void setInstance(Instance instance, Pos pos) { }
    public net.minestom.server.network.player.PlayerConnection getPlayerConnection() { return null; }
}
