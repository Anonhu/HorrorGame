package net.minestom.server.instance;
public interface Clock {
    float rate();
    void rate(float rate);
    long time();
    void time(long time);
    void pause();
    void resume();
}
