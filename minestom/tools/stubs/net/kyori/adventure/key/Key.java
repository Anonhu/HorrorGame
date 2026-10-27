package net.kyori.adventure.key;
public interface Key {
    static Key key(String value) { return new Key() { public String toString() { return value; } }; }
}
