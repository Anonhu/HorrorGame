package ru.leshorror.game;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.kyori.adventure.title.Title;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.entity.Player;
import net.minestom.server.instance.Instance;
import net.minestom.server.scoreboard.Sidebar;
import ru.leshorror.world.LesWorld;
import ru.leshorror.world.Palette;

import java.time.Duration;
import java.util.List;

/**
 * Per-player state for one run of the ritual.
 *
 * <p>The core resource is <b>noise</b>: sprinting, using the lantern and
 * every echo ping raise it, crouching keeps it low. The stag hunts noise.
 */
public final class Session {
    public static final int MAX_HEARTS = 3;

    private final Player player;
    private final Sidebar sidebar;
    private final List<Shrine> shrines;

    private int hearts = MAX_HEARTS;
    private double noise = 0;
    private int pings = 0;
    private double time = 0;
    private boolean finished = false;
    private boolean won = false;
    private boolean lastMoving = false;

    private double lastX, lastZ;
    private double pingCooldown = 0;
    private double echoPulse = 0;

    public Session(Player player, List<Shrine> shrines) {
        this.player = player;
        this.shrines = shrines;
        this.sidebar = new Sidebar(Component.text("ЛЕС СЛУШАЕТ", NamedTextColor.GOLD));
        this.lastX = player.getPosition().x();
        this.lastZ = player.getPosition().z();
    }

    public Player player() { return player; }
    public List<Shrine> shrines() { return shrines; }
    public double noise() { return noise; }
    public int hearts() { return hearts; }
    public double elapsed() { return time; }
    public int pings() { return pings; }
    public boolean finished() { return finished; }
    public boolean won() { return won; }
    public boolean echoActive() { return echoPulse > 0; }
    public double echo() { return echoPulse; }

    public void attack() {
        pingCooldown = 2.0;
        pings++;
        echoPulse = 1.35;                 // seconds of "echo sight"
        noise = Math.min(100, noise + 30);
    }

    public void damage(int amount) {
        if (finished) return;
        hearts = Math.max(0, hearts - amount);
        noise = 100;
        player.sendActionBar(Palette.warn("оно коснулось тебя"));
        if (hearts <= 0) finish(false);
    }

    public void finish(boolean victory) {
        if (finished) return;
        finished = true;
        won = victory;
        if (victory) {
            player.showTitle(Title.title(
                    Component.text("ОБРЯД ЗАВЕРШЁН", NamedTextColor.GOLD),
                    Component.text("лес принял дар. до следующей осени.", NamedTextColor.GRAY),
                    Title.Times.times(Duration.ofMillis(400), Duration.ofSeconds(3), Duration.ofSeconds(1))));
            player.sendMessage(Palette.ritual("Ты выжил. В этот раз."));
        } else {
            player.showTitle(Title.title(
                    Component.text("ЛЕС ЗАБРАЛ ТЕБЯ", NamedTextColor.DARK_RED),
                    Component.text("ты слышал его шаги. он — твои.", NamedTextColor.GRAY),
                    Title.Times.times(Duration.ofMillis(400), Duration.ofSeconds(3), Duration.ofSeconds(1))));
        }
    }

    public int litCount() {
        int n = 0;
        for (Shrine s : shrines) if (s.lit()) n++;
        return n;
    }

    public void reset(Instance instance) {
        hearts = MAX_HEARTS;
        noise = 0;
        pings = 0;
        time = 0;
        finished = false;
        won = false;
        echoPulse = 0;
        for (Shrine s : shrines) s.reset(instance);
        player.teleport(new Pos(0.5, LesWorld.SPAWN_Y + 1, 4.5, 180f, 0f));
        updateSidebar();
    }

    /** called every 100 ms from the tick task */
    public void tick(Instance instance, double dt, double stagDistance) {
        if (finished) return;
        time += dt;
        pingCooldown = Math.max(0, pingCooldown - dt);
        echoPulse = Math.max(0, echoPulse - dt);

        Pos pos = player.getPosition();
        double moved = Math.hypot(pos.x() - lastX, pos.z() - lastZ);
        double speed = moved / Math.max(dt, 1e-4);
        lastMoving = speed > 0.8;
        lastX = pos.x();
        lastZ = pos.z();

        // ---- noise: sprint > walk > crouch, lantern adds a constant hum ----
        double target;
        if (player.isSneaking()) {
            target = lastMoving ? 6 : 2;
        } else if (player.isSprinting()) {
            target = 80;
        } else {
            target = lastMoving ? 26 : 3;
        }
        target += 5;                                  // the lantern is always lit
        noise += (Math.min(100, target) - noise) * Math.min(1, dt * 2.2);
        noise = Math.max(0, Math.min(100, noise));

        // ---- shrines ----
        for (Shrine s : shrines) {
            if (s.tick(player, instance, lastMoving, dt)) onIgnite(s);
        }

        // ---- heartbeat pacing: closer stag = faster action bar ----
        if ((int) (time * 4) % 3 == 0) {
            player.sendActionBar(Palette.noise((int) noise));
        }
        if (stagDistance < 22 && !finished) {
            player.sendActionBar(Palette.warn("оно рядом"));
        }

        if (litCount() == 4) {
            double d = Math.hypot(pos.x(), pos.z());
            if (d < 5.2) {
                if (shrineRitualT < 6) {
                    shrineRitualT += dt;
                    player.sendActionBar(Palette.ritual("стой в круге · обряд идёт"));
                    if (shrineRitualT >= 6) finish(true);
                }
            } else if (shrineRitualT > 0) {
                shrineRitualT = 0;
                player.sendActionBar(Palette.warn("круг остыл. вернись."));
            }
        }
        updateSidebar();
    }

    private double shrineRitualT = 0;

    private void onIgnite(Shrine s) {
        noise = Math.min(100, noise + 22);
        player.sendMessage(Palette.ritual("◆ " + s.name() + " — зажжён (" + litCount() + "/4)"));
        player.showTitle(Title.title(
                Component.text(s.name(), NamedTextColor.GOLD),
                Component.text("он услышал", NamedTextColor.GRAY),
                Title.Times.times(Duration.ofMillis(200), Duration.ofSeconds(2), Duration.ofMillis(500))));
        if (litCount() == 4) {
            player.sendMessage(Palette.warn("ЧЕТЫРЕ. ВЕРНИСЬ К КРУГУ."));
        }
    }

    private void updateSidebar() {
        if (!sidebar.getPlayers().contains(player)) sidebar.addViewer(player);
        sidebar.setTitle(Component.text("ЛЕС СЛУШАЕТ", NamedTextColor.GOLD));
        sidebar.createLine(new Sidebar.ScoreboardLine("obj", Component.text()
                .append(Component.text("тотемы ", NamedTextColor.DARK_GRAY))
                .append(Component.text(litCount() + " / 4", NamedTextColor.GOLD)), 10));
        sidebar.createLine(new Sidebar.ScoreboardLine("noise", Palette.noise((int) noise), 9));
        sidebar.createLine(new Sidebar.ScoreboardLine("hearts", Component.text()
                .append(Component.text("жизни ", NamedTextColor.DARK_GRAY))
                .append(Component.text("♥".repeat(hearts) + "♡".repeat(MAX_HEARTS - hearts),
                        hearts > 1 ? NamedTextColor.RED : NamedTextColor.DARK_RED)), 8));
        sidebar.createLine(new Sidebar.ScoreboardLine("echo", Component.text()
                .append(Component.text("эхо ", NamedTextColor.DARK_GRAY))
                .append(Component.text(pingCooldown <= 0 ? "готово" : Math.ceil(pingCooldown) + "с",
                        pingCooldown <= 0 ? NamedTextColor.AQUA : NamedTextColor.DARK_GRAY)), 7));
        sidebar.createLine(new Sidebar.ScoreboardLine("time", Component.text()
                .append(Component.text("в лесу ", NamedTextColor.DARK_GRAY))
                .append(Component.text(String.format("%d:%02d", (int) time / 60, (int) time % 60),
                        NamedTextColor.GRAY)), 6));
    }

    public void dispose() {
        sidebar.removeViewer(player);
    }
}
