package net.minestom.server.event;
import java.util.function.Consumer;
public class GlobalEventHandler {
    public <E> void addListener(Class<E> type, Consumer<E> listener) { }
}
