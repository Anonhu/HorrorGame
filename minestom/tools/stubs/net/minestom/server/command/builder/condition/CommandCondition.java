package net.minestom.server.command.builder.condition;
import net.minestom.server.command.CommandSender;
@FunctionalInterface
public interface CommandCondition {
    boolean canUse(CommandSender sender, String commandString);
}
