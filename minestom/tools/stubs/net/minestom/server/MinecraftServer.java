package net.minestom.server;
import net.minestom.server.command.CommandManager;
import net.minestom.server.event.GlobalEventHandler;
import net.minestom.server.instance.InstanceManager;
import net.minestom.server.network.ConnectionManager;
import net.minestom.server.timer.SchedulerManager;
public final class MinecraftServer {
    public static final String VERSION_NAME = "26.3";
    public static final int PROTOCOL_VERSION = 777;
    public static MinecraftServer init(Auth auth) { return new MinecraftServer(); }
    public static void setCompressionThreshold(int v) { }
    public static GlobalEventHandler getGlobalEventHandler() { return new GlobalEventHandler(); }
    public static InstanceManager getInstanceManager() { return new InstanceManager(); }
    public static CommandManager getCommandManager() { return new CommandManager(); }
    public static SchedulerManager getSchedulerManager() { return new SchedulerManager(); }
    public static ConnectionManager getConnectionManager() { return null; }
    public static void stopCleanly() { }
    public void start(String host, int port) { }
}
