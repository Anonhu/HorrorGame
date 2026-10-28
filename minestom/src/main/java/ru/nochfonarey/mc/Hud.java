package ru.nochfonarey.mc;

import net.kyori.adventure.text.Component;
import net.kyori.adventure.text.format.NamedTextColor;
import net.minestom.server.entity.Player;
import net.minestom.server.scoreboard.Sidebar;
import ru.nochfonarey.core.InnMode;
import ru.nochfonarey.core.LanternMode;
import ru.nochfonarey.core.Mode;
import ru.nochfonarey.core.P;
import ru.nochfonarey.core.RelayMode;
import ru.nochfonarey.core.Room;

import java.util.ArrayList;
import java.util.List;

/** Боковая панель и строка над хотбаром: всё, что игрок должен видеть без чата. */
public final class Hud {

    private static final int LINES = 16;

    private final Sidebar sidebar;
    private final List<String> cache = new ArrayList<>();
    private final Player player;

    public Hud(Player player, String title) {
        this.player = player;
        this.sidebar = new Sidebar(Component.text(title, NamedTextColor.DARK_RED));
        for (int i = 0; i < LINES; i++) {
            cache.add("");
            sidebar.createLine(new Sidebar.ScoreboardLine("l" + i, Component.empty(), LINES + 2 - i));
            sidebar.updateLineContent("l" + i, Component.empty());
        }
        sidebar.addViewer(player);
    }

    public void close() {
        sidebar.removeViewer(player);
    }

    private void line(int index, String text, NamedTextColor color) {
        if (index < 0 || index >= LINES) return;
        String key = color + "|" + text;
        if (key.equals(cache.get(index))) return;
        cache.set(index, key);
        sidebar.updateLineContent("l" + index, Component.text(text, color));
    }

    private void blank(int from) {
        for (int i = from; i < LINES; i++) {
            if (!cache.get(i).isEmpty()) line(i, "", NamedTextColor.GRAY);
        }
    }

    public void update(Room room, P me) {
        int i = 0;
        Mode mode = room.mode;
        if (mode instanceof LanternMode m) {
            line(i++, "ФОНАРЩИКИ", NamedTextColor.DARK_RED);
            int lit = 0;
            for (LanternMode.Fire f : m.fires) if (f.lit) lit++;
            if (m.voteOpen) {
                line(i++, "ГОЛОСОВАНИЕ", NamedTextColor.GOLD);
                line(i++, "кто уйдёт по мосту", NamedTextColor.GRAY);
                line(i++, "Осталось: " + (int) Math.max(0, m.voteDeadline - m.t) + " с", NamedTextColor.RED);
            } else {
                line(i++, "До рассвета: " + (int) Math.max(0, LanternMode.ROUND - m.t) + " с", NamedTextColor.GRAY);
            }
            line(i++, "Костры: " + lit + "/4", lit >= 3 ? NamedTextColor.GREEN
                    : lit >= 1 ? NamedTextColor.GOLD : NamedTextColor.RED);
            line(i++, "", NamedTextColor.GRAY);
            line(i++, "Фонарь: " + bars(me.charge), me.charge > 60 ? NamedTextColor.GREEN
                    : me.charge > 20 ? NamedTextColor.GOLD : NamedTextColor.RED);
            line(i++, "Заряд: " + (int) me.charge + "%", NamedTextColor.GRAY);
            line(i++, "Дрова: " + me.logs + "/" + LanternMode.MAX_CARRY, NamedTextColor.GRAY);
            if (me.shadow(m.t)) {
                line(i++, "", NamedTextColor.GRAY);
                line(i++, "ТЫ ТЕНЬ", NamedTextColor.DARK_PURPLE);
                line(i++, "погаси костёр", NamedTextColor.LIGHT_PURPLE);
                line(i++, (int) Math.max(0, me.shadowUntil - m.t) + " с", NamedTextColor.DARK_PURPLE);
            }
            if (me.held(m.t)) {
                line(i++, "ТЕБЯ ДЕРЖАТ", NamedTextColor.RED);
            }
            if (me.stunned(m.t)) {
                line(i++, "СВЕТ ДЕРЖИТ", NamedTextColor.YELLOW);
            }
        } else if (mode instanceof RelayMode m) {
            line(i++, "ЭСТАФЕТА СВЕТА", NamedTextColor.DARK_RED);
            if (m.done) {
                line(i++, "Финал", NamedTextColor.GRAY);
            } else {
                line(i++, "До рассвета: " + (int) Math.max(0, RelayMode.ROUND - m.t) + " с", NamedTextColor.GRAY);
            }
            line(i++, "Фонарь: " + bars(m.lanternCharge), m.lanternCharge > 60 ? NamedTextColor.GREEN
                    : m.lanternCharge > 25 ? NamedTextColor.GOLD : NamedTextColor.RED);
            line(i++, (int) m.lanternCharge + "%" + (m.lanternOnGround ? " (на земле)" : ""), NamedTextColor.GRAY);
            P carrier = m.carrier();
            line(i++, "Несёт: " + (carrier == null ? "—" : carrier.name), NamedTextColor.YELLOW);
            line(i++, "", NamedTextColor.GRAY);
            double cd = m.collectorDist(me);
            line(i++, "Собиратель: " + (int) cd + " м", cd < 20 ? NamedTextColor.RED : NamedTextColor.GRAY);
            line(i++, "До часовни: " + (int) Math.max(0, RelayMode.CHAPEL_X + 6 - me.x) + " м", NamedTextColor.GRAY);
            if (m.altarProg > 0.01) {
                line(i++, "Алтарь: " + bars(m.altarProg * 100), NamedTextColor.LIGHT_PURPLE);
            }
            double sl = m.shoutLeft(me);
            line(i++, "Крик (F): " + (sl > 0 ? (int) sl + " с" : "готов"), NamedTextColor.GRAY);
        } else if (mode instanceof InnMode m) {
            line(i++, "ПОСТОЯЛЫЙ ДВОР", NamedTextColor.DARK_RED);
            line(i++, "Цикл " + (m.cycle + 1) + "/" + InnMode.CYCLES, NamedTextColor.GRAY);
            line(i++, "Этап: " + m.stageName(), NamedTextColor.GOLD);
            if (m.voteOpenNow()) {
                line(i++, "Голосование: " + (int) Math.max(0, m.voteDeadline - m.t) + " с", NamedTextColor.RED);
            }
            int lit = m.litCandles();
            line(i++, "Свечи: " + lit + "/" + m.candles.size(), lit == 0 ? NamedTextColor.DARK_RED
                    : lit == 1 ? NamedTextColor.RED : lit < m.candles.size() / 2 + 1
                    ? NamedTextColor.GOLD : NamedTextColor.GREEN);
            line(i++, "Живых: " + m.aliveCount() + " · Забрано: " + m.kills + "/" + m.killToWin,
                    m.kills >= m.killToWin - 1 ? NamedTextColor.RED : NamedTextColor.GRAY);
            if (me.lightProg > 0.01) {
                line(i++, "Зажигаю свечу: " + bars(me.lightProg / InnMode.LIGHT_TIME * 100),
                        NamedTextColor.GOLD);
            } else if (!me.impostor && !me.cellared) {
                line(i++, "Огонёк: " + bars(me.candle), me.candle > 55 ? NamedTextColor.YELLOW
                        : me.candle > 20 ? NamedTextColor.GOLD : NamedTextColor.RED);
            }
            line(i++, "", NamedTextColor.GRAY);
            String where = m.roomName(me.roomId);
            line(i++, "Ты: " + where, NamedTextColor.GRAY);
            if (me.cellared) line(i++, "ТЫ В ПОДВАЛЕ", NamedTextColor.DARK_RED);
            if (me.impostor) {
                line(i++, "ТЫ НЕ ГОСТЬ", NamedTextColor.DARK_PURPLE);
            }
            if (!me.clues.isEmpty()) {
                line(i++, "", NamedTextColor.GRAY);
                line(i++, "Улики: " + me.clues.size(), NamedTextColor.GRAY);
            }
            if (m.voteOpenNow()) {
                line(i++, "ПКМ по свече — меню", NamedTextColor.LIGHT_PURPLE);
            }
        } else {
            line(i++, "ЖДЁМ", NamedTextColor.GRAY);
        }
        // ночные события: что уже случилось и когда ждать следующее
        if (mode != null && !mode.forecast.isEmpty()) {
            if (mode.lastNight != null) {
                line(i++, "Ночь: " + mode.lastNight.title(), NamedTextColor.DARK_PURPLE);
            }
            double left = mode.nextNightAt - mode.t;
            line(i++, "Событие через " + (int) Math.max(0, left) + " с", NamedTextColor.DARK_GRAY);
        }
        blank(i);

        // строка над хотбаром — быстрая подсказка
        String bar = hint(room, me);
        if (bar != null) player.sendActionBar(Component.text(bar, NamedTextColor.GRAY));
    }

    private static String hint(Room room, P me) {
        Mode mode = room.mode;
        if (mode instanceof LanternMode m) {
            if (me.shadow(m.t)) return "Ты — Тень. Shift у костра — погасить. Свет тебя ловит.";
            if (me.held(m.t)) return "ТЕБЯ ДЕРЖАТ — жди, пока свои оттащат";
            if (me.stunned(m.t)) return "Свет держит тебя";
            if (me.logs > 0) return "Shift у костра — подбросить дрова (" + me.logs + ")";
            if (me.charge < 100) return "Shift у костра — зарядить фонарь";
            return "Иди по кучкам дров — они подберутся сами";
        }
        if (mode instanceof RelayMode m) {
            if (me.id.equals(m.carrierId)) {
                if (m.nearAltar(me)) return "Shift у алтаря — разбить фонарь о камень";
                if (m.nearFire(me)) return "Shift у костра — зарядить фонарь";
                return "Ты несёшь фонарь. Клавиша F — передать ближайшему";
            }
            return "Держись рядом с фонарём. F — крикнуть (приманка)";
        }
        if (mode instanceof InnMode m) {
            if (m.voteOpenNow()) return "ПКМ по свече в зале — голосовать";
            if (m.candleNear(me, 3.0, true) != null) {
                return "F у подсвечника — зажечь свечу (или держи Shift)";
            }
            if (m.dark()) return "В доме темно — F или Shift у подсвечника";
            if (me.impostor) return "Shift рядом с гостем без свидетелей — забрать его";
            return "Ходи, слушай, собирай улики. " + m.stageName();
        }
        return null;
    }

    private static String bars(double value) {
        int n = (int) Math.round(Math.max(0, Math.min(100, value)) / 10);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 10; i++) sb.append(i < n ? '█' : '░');
        return sb.toString();
    }
}
