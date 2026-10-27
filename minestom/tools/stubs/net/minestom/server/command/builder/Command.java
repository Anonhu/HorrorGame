package net.minestom.server.command.builder;
import net.minestom.server.command.CommandSender;
import net.minestom.server.command.builder.arguments.Argument;
import net.minestom.server.command.builder.condition.CommandCondition;
/**
 * Заглушка Command. Состав сверен с 26.3 (tools/verify_stubs.py).
 * В Minestom executor — отдельный интерфейс CommandExecutor.apply(...),
 * а не вложенный Command.Executor.execute(...) из старых версий.
 */
public class Command {
    public Command(String name, String... aliases) { }
    public Command(String name) { }
    public void setCondition(CommandCondition condition) { }
    public void setDefaultExecutor(CommandExecutor executor) { }
    public void addSyntax(CommandExecutor executor, Argument<?>... args) { }
}
