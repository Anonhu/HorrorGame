import ru.nochfonarey.core.Blueprint;
import ru.nochfonarey.core.Lobby;
import ru.nochfonarey.core.RoomLobby;

import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Выгружает раскладку лобби и комнат ожидания в TSV — по нему
 * {@code resourcepack/tools/render_blocks.py} рисует изометрическую картинку.
 *
 * <p>Компилируется одним файлом с {@code src/main/java/ru/nochfonarey/core/*}
 * без Minestom и без сети: {@link Blueprint} — это чистый интерфейс.
 *
 * <pre>java -cp classes LobbyPreview out.tsv</pre>
 */
public final class LobbyPreview {

    private LobbyPreview() {
    }

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "preview.tsv";
        PrintWriter pw = new PrintWriter(out, StandardCharsets.UTF_8);
        pw.println("#x\ty\tz\tkey\tfacing");
        dump(pw, "lobby", bp -> Lobby.build(bp));
        dump(pw, "lantern", bp -> RoomLobby.build(bp, "lantern"));
        dump(pw, "relay", bp -> RoomLobby.build(bp, "relay"));
        dump(pw, "inn", bp -> RoomLobby.build(bp, "inn"));
        pw.close();
        System.out.println("раскладка выгружена: " + out);
    }

    interface Builder {
        void build(Blueprint bp);
    }

    private static void dump(PrintWriter pw, String scene, Builder builder) {
        Map<Long, String> cells = new LinkedHashMap<>();
        Blueprint bp = new Blueprint() {
            @Override
            public void put(int x, int y, int z, String key) {
                cells.put(key(x, y, z), key);
            }

            @Override
            public void light(int x, int y, int z, int level) {
                cells.put(key(x, y, z), level <= 0 ? "air" : "light" + level);
            }

            @Override
            public void putFacing(int x, int y, int z, String key, String facing) {
                cells.put(key(x, y, z), key + "@" + facing);
            }

            private long key(int x, int y, int z) {
                return ((long) (x + 512) << 40) | ((long) (y + 512) << 20) | (z + 512);
            }
        };
        builder.build(bp);
        // пустой воздух и «свет» в картинке не нужны: свет не имеет текстуры
        cells.forEach((pos, key) -> {
            if (key.equals("air") || key.startsWith("light")) return;
            int x = (int) ((pos >> 40) - 512);
            int y = (int) (((pos >> 20) & 0xFFFFF) - 512);
            int z = (int) ((pos & 0xFFFFF) - 512);
            pw.println(scene + "\t" + x + "\t" + y + "\t" + z + "\t" + key);
        });
    }
}
