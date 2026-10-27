package net.minestom.server.command;
import net.kyori.adventure.text.Component;
/**
 * Заглушка CommandSender. В 26.3 лежит в net.minestom.server.command,
 * а не в ...command.builder. sendMessage(Component) наследуется от Audience.
 */
public interface CommandSender {
    void sendMessage(Component message);
}
