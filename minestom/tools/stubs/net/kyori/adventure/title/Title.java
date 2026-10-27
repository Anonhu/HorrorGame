package net.kyori.adventure.title;
import net.kyori.adventure.text.Component;
import java.time.Duration;
public interface Title {
    static Title title(Component a, Component b) { return null; }
    static Title title(Component a, Component b, Times t) { return null; }
    final class Times {
        public static Times times(Duration fadeIn, Duration stay, Duration fadeOut) { return new Times(); }
    }
}
