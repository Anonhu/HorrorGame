package ru.nochfonarey.core;

/**
 * Куда строить: тонкая прослойка между раскладкой и Minecraft.
 *
 * <p>Лобби и комнаты ожидания описаны в {@code core} и говорят только
 * строковыми ключами блоков ({@link Keys}). Поэтому одну и ту же раскладку
 * можно:
 * <ul>
 *   <li>поставить в настоящий мир — {@code ru.nochfonarey.mc.McBlueprint};</li>
 *   <li>записать в карту и отрисовать картинку без клиента —
 *       {@code tools/preview/LobbyPreview.java} (см. {@code tools/preview-lobby.sh}).</li>
 * </ul>
 */
public interface Blueprint {

    /** Поставить блок по ключу {@link Keys}. */
    void put(int x, int y, int z, String key);

    /** Невидимый источник света: уровень 0 — убрать. */
    void light(int x, int y, int z, int level);

    /** Убрать блок. */
    default void clear(int x, int y, int z) {
        put(x, y, z, Keys.AIR);
    }

    /** Блок с поворотом (тыквы, полки); по умолчанию поворот игнорируется. */
    default void putFacing(int x, int y, int z, String key, String facing) {
        put(x, y, z, key);
    }

    /** Сплошной параллелепипед по углам включительно. */
    default void box(int x0, int y0, int z0, int x1, int y1, int z1, String key) {
        for (int x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
            for (int y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
                for (int z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
                    put(x, y, z, key);
    }
}
