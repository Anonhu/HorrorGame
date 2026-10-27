package ru.nochfonarey.core;

/**
 * Всё, что ядро просит у мира. Реализация — слой Minecraft (или пустышка в self-тесте).
 * Никаких импортов Minestom здесь нет специально: ядро тестируется без сервера.
 */
public interface Host {

    void chat(P p, String text, Tone tone);

    void title(P p, String big, String small);

    void sound(P p, String key, float volume, float pitch);

    void soundAt(double x, double z, String key, float volume, float pitch);

    void particle(String key, double x, double y, double z, int count, double spread);

    /** Поставить блок. key — полный ключ, например "minecraft:campfire[lit=false]". */
    void block(int x, int y, int z, String key);

    /** Источник света: level 0 — убрать. */
    void light(int x, int y, int z, int level);

    /**
     * «Живой» источник света, который двигается. Слой Minecraft сам убирает
     * прошлый блок, когда координата меняется. level 0 — выключить.
     */
    void followLight(String id, double x, double z, int level);

    /** Строительство закончено — можно телепортировать игроков. */
    void ready();
}
