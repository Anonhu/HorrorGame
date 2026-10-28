package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.List;

/** Состояние игрока в раунде: позиция приходит из Minecraft, остальное считает ядро. */
public final class P {
    public final String id;
    public String name;

    // мир (x, z — плоскость, y задаёт слой)
    public double x, z;
    public float yaw;
    public boolean alive = true;
    public boolean spectator = false;

    // общий инвентарь режимов
    public double charge = 100;
    public int logs = 0;
    public boolean lanternOn = true;
    public String role = "keeper";
    public String vote = null;

    // тайминги на часах комнаты
    public double actUntil = -1;
    public double shadowUntil = -1;
    public double stunUntil = -1;
    public double heldUntil = -1;

    // прогрессы удержания
    public double feedProg, chargeProg, douseProg, catchProg, rescueProg, takeProg, altarProg;
    /** Зажигание общей свечи во дворе (секунды удержания). */
    public double lightProg;
    /** Откат одиночного действия (F/ПКМ) в секундах раунда. */
    public double useCd;

    // двор
    public int candle = 100;
    public String roomId = "hall";
    public boolean cellared = false;
    public boolean impostor = false;
    public final List<String> clues = new ArrayList<>();

    // статистика
    public int kills, catches, ignites, deaths;

    public P(String id, String name) {
        this.id = id;
        this.name = name == null ? "Гость" : name;
    }

    public boolean acting(double now) {
        return actUntil > now;
    }

    public boolean shadow(double now) {
        return shadowUntil > now;
    }

    public boolean stunned(double now) {
        return stunUntil > now;
    }

    public boolean held(double now) {
        return heldUntil > now;
    }

    public double dist(P o) {
        double dx = o.x - x, dz = o.z - z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    public double dist(double bx, double bz) {
        double dx = bx - x, dz = bz - z;
        return Math.sqrt(dx * dx + dz * dz);
    }
}
