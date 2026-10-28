package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Общая часть режима: часы, существа, победитель, итог. */
public abstract class Mode {
    public final Room room;
    protected final Host host;

    /** Ночные события этого раунда: прогноз, уже случившиеся и следующее по времени. */
    public final List<Night.Event> forecast = new ArrayList<>();
    public final List<String> nights = new ArrayList<>();
    public Night.Event lastNight = null;
    public double nextNightAt = 0;
    protected final Random nightRnd = new Random();

    public double t = 0;
    public boolean done = false;
    public String winner = null;
    public String phase = "play";
    public final List<Mob> mobs = new ArrayList<>();

    protected Mode(Room room) {
        this.room = room;
        this.host = room.host;
    }

    public abstract void start();

    public abstract void tick(double dt);

    /** Свой набор ночных событий у каждого режима. */
    protected abstract Night.Event[] nightPool();

    /** Что именно делает событие. Возвращает false, если эффект не сработал. */
    protected abstract boolean applyNight(Night.Event event);

    /** Прогноз в начале ночи: игроки заранее знают, к чему готовиться. */
    protected void planNight(int count) {
        forecast.clear();
        nights.clear();
        forecast.addAll(Night.forecast(nightRnd, nightPool(), count));
        nextNightAt = 35 + nightRnd.nextDouble() * 15;
        StringBuilder sb = new StringBuilder("Ночь обещает: ");
        for (int i = 0; i < forecast.size(); i++) {
            if (i > 0) sb.append(" · ");
            sb.append(forecast.get(i).title());
        }
        chatAll(sb.toString(), Tone.INFO);
    }

    /** Один тик часов событий. Вызывается режимами из tick(). */
    protected void nightTick() {
        if (t < nextNightAt) return;
        Night.Event e = Night.next(nightRnd, nightPool(), nights);
        nextNightAt = t + Night.gap(nightRnd);
        lastNight = e;
        try {
            // эффект может не сработать (некого пугать) — сообщение всё равно
            // уходит, чтобы ритм ночи не ломался
            applyNight(e);
        } catch (RuntimeException ex) {
            // одно кривое событие не должно убивать раунд
            System.err.println("[night " + e.id() + "] " + ex);
        }
        chatAll(e.title() + ". " + e.text() + ".", Tone.DARK);
    }

    /** Разовая команда игрока: action = "vote" | "shout" | "pass" | ... */
    public void act(P p, String action, String target) {
    }

    public String summary() {
        return "";
    }

    public double now() {
        return t;
    }

    protected List<P> alive() {
        List<P> out = new ArrayList<>();
        for (P p : room.players.values()) if (p.alive) out.add(p);
        return out;
    }

    protected void chatAll(String text, Tone tone) {
        host.chat(null, text, tone);
    }

    protected void chat(P p, String text, Tone tone) {
        host.chat(p, text, tone);
    }

    protected void kill(P victim, String reason) {
        if (!victim.alive) return;
        victim.alive = false;
        victim.spectator = true;
        victim.deaths++;
        victim.heldUntil = -1;
        host.title(victim, "ТЕБЯ ЗАБРАЛИ", reason);
        host.sound(victim, "minecraft:entity.wither.death", 0.6f, 0.6f);
        chatAll(victim.name + " " + reason.toLowerCase() + ".", Tone.DARK);
    }

    protected static double clamp(double v, double a, double b) {
        return v < a ? a : (v > b ? b : v);
    }

    protected static double dist(double x1, double z1, double x2, double z2) {
        double dx = x2 - x1, dz = z2 - z1;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /** Разница углов в градусах, 0..180 */
    protected static double angleDiff(float a, float b) {
        double d = Math.abs(a - b) % 360.0;
        return d > 180 ? 360 - d : d;
    }

    /** Направление (yaw Minecraft) от точки A к точке B. */
    protected static float yawTo(double fromX, double fromZ, double toX, double toZ) {
        double dx = toX - fromX, dz = toZ - fromZ;
        double yaw = Math.toDegrees(Math.atan2(-dx, dz));
        return (float) yaw;
    }

    protected static int sign(double v) {
        return v < 0 ? -1 : 1;
    }
}
