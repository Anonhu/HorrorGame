package net.minestom.server.ping;
import net.kyori.adventure.text.Component;
/**
 * Заглушка Status. В 26.3 это record; PlayerInfo — тоже record,
 * его геттеры называются onlinePlayers/maxPlayers, а не online/max.
 */
public interface Status {
    static Builder builder() { return new Builder(); }
    record PlayerInfo(int onlinePlayers, int maxPlayers) {
        public static PlayerInfo online(int maxSamples) { return null; }
    }
    record VersionInfo(String name, int protocolVersion) { }
    final class Builder {
        public Builder description(Component description) { return this; }
        public Builder versionInfo(VersionInfo info) { return this; }
        public Builder playerInfo(PlayerInfo info) { return this; }
        public Status build() { return null; }
    }
}
