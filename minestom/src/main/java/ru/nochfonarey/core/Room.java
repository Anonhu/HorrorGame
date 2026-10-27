package ru.nochfonarey.core;

import java.util.LinkedHashMap;
import java.util.Map;

/** Комната: код, режим, игроки, фаза. */
public final class Room {
    public enum Phase { LOBBY, PLAY, END }

    public final String code;
    public final ModeType type;
    public final Host host;
    public final Map<String, P> players = new LinkedHashMap<>();

    public String hostId;
    public Mode mode;
    public Phase phase = Phase.LOBBY;
    public double endAt = 0;
    public String summary = "";
    public double lastActivity = 0;

    public Room(String code, ModeType type, Host host) {
        this.code = code;
        this.type = type;
        this.host = host;
    }

    public P add(String id, String name) {
        P p = new P(id, name);
        players.put(id, p);
        if (hostId == null) hostId = id;
        return p;
    }

    public P byId(String id) {
        return players.get(id);
    }

    public void remove(String id) {
        players.remove(id);
        P next = players.values().stream().findFirst().orElse(null);
        if (id.equals(hostId)) hostId = next == null ? null : next.id;
        if (players.isEmpty() && mode != null) mode.done = true;
    }

    public boolean canStart() {
        return phase == Phase.LOBBY && players.size() >= Math.min(type.min, 1) && !players.isEmpty()
                && (players.size() >= type.min || players.size() == 1);
    }

    public boolean start() {
        if (phase != Phase.LOBBY || players.isEmpty()) return false;
        switch (type) {
            case LANTERN: mode = new LanternMode(this); break;
            case RELAY: mode = new RelayMode(this); break;
            default: mode = new InnMode(this); break;
        }
        phase = Phase.PLAY;
        mode.start();
        host.ready();
        return true;
    }

    public void tick(double dt) {
        if (phase != Phase.PLAY || mode == null) {
            if (phase == Phase.END && endAt > 0 && tNow() > endAt) {
                // комната остаётся, пока есть кто-то живой; сброс делает лобби
            }
            return;
        }
        mode.tick(dt);
        if (mode.done && phase == Phase.PLAY) {
            phase = Phase.END;
            summary = mode.summary();
            endAt = tNow() + 45;
            host.chat(null, "РАУНД ОКОНЧЕН: " + summary, Tone.GOOD);
        }
    }

    private static double tNow() {
        return System.currentTimeMillis() / 1000.0;
    }

    public void act(String playerId, String action, String target) {
        P p = players.get(playerId);
        if (p != null && mode != null && phase == Phase.PLAY) mode.act(p, action, target);
    }

    public void reset() {
        mode = null;
        phase = Phase.LOBBY;
        summary = "";
        endAt = 0;
        for (P p : players.values()) {
            p.alive = true;
            p.spectator = false;
            p.vote = null;
            p.charge = 100;
            p.logs = 0;
            p.lanternOn = true;
            p.role = "keeper";
            p.impostor = false;
            p.cellared = false;
            p.clues.clear();
            p.heldUntil = -1;
            p.shadowUntil = -1;
            p.stunUntil = -1;
            p.actUntil = -1;
            p.feedProg = p.chargeProg = p.douseProg = p.catchProg = p.rescueProg = p.takeProg = p.altarProg = 0;
            p.kills = p.catches = p.ignites = p.deaths = 0;
        }
    }
}
