package net.kyori.adventure.text;
import net.kyori.adventure.text.format.NamedTextColor;
public interface Component {
    static Component text(String s) { return null; }
    static Component text(String s, NamedTextColor c) { return null; }
    static Component empty() { return null; }
    static Component newline() { return null; }
    Component append(Component other);
}
