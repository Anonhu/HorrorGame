package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Комнаты, коды, единый тик. Не зависит от Minecraft. */
public final class GameServer {
    public final Host host;
    public final List<Room> rooms = new ArrayList<>();
    private final Random rnd = new Random();

    public GameServer(Host host) {
        this.host = host;
    }

    public Room create(ModeType type, String playerId, String playerName) {
        String code;
        do {
            code = String.valueOf(1000 + rnd.nextInt(9000));
        } while (byCode(code) != null);
        Room room = new Room(code, type, host);
        room.add(playerId, playerName);
        room.lastActivity = System.currentTimeMillis();
        rooms.add(room);
        return room;
    }

    public Room byCode(String code) {
        if (code == null) return null;
        String c = code.trim();
        for (Room r : rooms) if (r.code.equals(c)) return r;
        return null;
    }

    public Room of(String playerId) {
        for (Room r : rooms) if (r.players.containsKey(playerId)) return r;
        return null;
    }

    public List<Room> openRooms() {
        List<Room> out = new ArrayList<>();
        for (Room r : rooms) if (r.phase == Room.Phase.LOBBY && r.players.size() < r.type.max) out.add(r);
        return out;
    }

    public void tick(double dt) {
        for (Room r : new ArrayList<>(rooms)) {
            r.tick(dt);
            if (r.players.isEmpty()) rooms.remove(r);
        }
    }

    public void join(Room room, String id, String name) {
        room.add(id, name);
        room.lastActivity = System.currentTimeMillis();
    }
}
