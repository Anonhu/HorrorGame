package ru.nochfonarey.core;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Ночные события — то, из-за чего два раунда не похожи друг на друга.
 *
 * <p>Каждый режим берёт из своего набора 3 события подряд (без повторов,
 * пока набор не кончится), объявляет их в начале ночи как «прогноз» и
 * запускает по одному каждые 40–65 секунд. У каждого события есть реальный
 * эффект в правилах, а не только строчка в чате: ветер съедает топливо
 * костров, туман ускоряет расход фонаря, стая поднимает лишних Тянущихся,
 * холод гасит личные огоньки, сквозняк дует на свечи.
 */
public final class Night {

    /** Одно событие: внутренний id, заголовок для чата и подсказка, что делать. */
    public record Event(String id, String title, String text) {
    }

    public static final Event[] LANTERN = {
            new Event("wind", "ВЕТЕР", "Пламя пригибается: костры теряют топливо"),
            new Event("fog", "ТУМАН", "Туман пьёт свет: фонари садятся вдвое быстрее"),
            new Event("whisper", "ШЁПОТ", "Лес выдаёт, где сейчас Тень"),
            new Event("swarm", "СТАЯ", "Из земли лезут новые Тянущиеся"),
    };

    public static final Event[] RELAY = {
            new Event("storm", "ГРОЗА", "Молния выжигает часть заряда фонаря"),
            new Event("swift", "ПОГОНЯ", "Собиратель ускоряется на полминуты"),
            new Event("damp", "СЫРОСТЬ", "Фонарь тлеет: заряд тает сам"),
    };

    public static final Event[] INN = {
            new Event("cold", "ХОЛОД", "У всех гостей гаснут личные огоньки"),
            new Event("creak", "СКРИП", "Пол выдаёт шёпотом одну улику"),
            new Event("draft", "СКВОЗНЯК", "Ещё одна общая свеча гаснет"),
    };

    private Night() {
    }

    /** Следующее событие: сначала неиспользованные, потом по кругу. */
    public static Event next(Random rnd, Event[] pool, List<String> used) {
        List<Event> fresh = new ArrayList<>();
        for (Event e : pool) if (!used.contains(e.id())) fresh.add(e);
        List<Event> from = fresh.isEmpty() ? List.of(pool) : fresh;
        Event picked = from.get(rnd.nextInt(from.size()));
        used.add(picked.id());
        return picked;
    }

    /** «Прогноз» на ночь: три события, которые точно случатся. */
    public static List<Event> forecast(Random rnd, Event[] pool, int count) {
        List<Event> copy = new ArrayList<>(List.of(pool));
        List<Event> out = new ArrayList<>();
        for (int i = 0; i < count && !copy.isEmpty(); i++) {
            out.add(copy.remove(rnd.nextInt(copy.size())));
        }
        return out;
    }

    /** Через сколько секунд случится следующее событие. */
    public static double gap(Random rnd) {
        return 40 + rnd.nextDouble() * 25;
    }
}
