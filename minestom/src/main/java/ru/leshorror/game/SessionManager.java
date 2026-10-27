package ru.leshorror.game;

import net.minestom.server.entity.Player;
import ru.leshorror.world.LesWorld;
import ru.leshorror.world.Plan;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Tracks every player's ritual run and owns the shrine list. */
public final class SessionManager {
    private final LesWorld world;
    private final Map<Player, Session> sessions = new ConcurrentHashMap<>();
    private final List<Shrine> shrines = new ArrayList<>();

    public SessionManager(LesWorld world) {
        this.world = world;
        for (Plan.Shrine s : Plan.SHRINES) shrines.add(new Shrine(s));
    }

    public LesWorld world() { return world; }
    public List<Shrine> shrines() { return shrines; }

    public Session join(Player player) {
        Session session = sessions.computeIfAbsent(player, p -> new Session(p, shrines));
        return session;
    }

    public Session get(Player player) {
        return sessions.get(player);
    }

    public void leave(Player player) {
        Session s = sessions.remove(player);
        if (s != null) s.dispose();
    }

    public Collection<Session> activeSessions() {
        return sessions.values();
    }

    public void tick(StagHollow stag) {
        double dt = 0.1;
        for (Session s : sessions.values()) {
            double d = stag.distanceTo(s.player());
            s.tick(world.instance(), dt, d);
        }
    }

    /** nearest player who is still alive in the ritual, for the stag AI. */
    public Session nearestAlive(double x, double z) {
        Session best = null;
        double bd = Double.MAX_VALUE;
        for (Session s : sessions.values()) {
            if (s.finished() || !s.player().isOnline()) continue;
            var p = s.player().getPosition();
            double d = Math.hypot(p.x() - x, p.z() - z);
            if (d < bd) { bd = d; best = s; }
        }
        return best;
    }

    public double distanceTo(Player player, double x, double z) {
        var p = player.getPosition();
        return Math.hypot(p.x() - x, p.z() - z);
    }
}
