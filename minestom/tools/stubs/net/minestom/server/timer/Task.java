package net.minestom.server.timer;
import java.time.temporal.TemporalUnit;
public interface Task {
    void cancel();
    final class Builder {
        public Builder repeat(long time, TemporalUnit unit) { return this; }
        public Builder delay(long time, TemporalUnit unit) { return this; }
        public Task schedule() { return null; }
    }
}
