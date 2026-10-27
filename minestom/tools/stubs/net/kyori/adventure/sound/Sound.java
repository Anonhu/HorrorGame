package net.kyori.adventure.sound;
import net.kyori.adventure.key.Key;
public interface Sound {
    enum Source { MASTER, PLAYER, HOSTILE }
    static Sound sound(Key key, Source source, float volume, float pitch) {
        return new Sound() { };
    }
}
