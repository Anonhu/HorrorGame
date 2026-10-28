package ru.nochfonarey.mc;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;

/**
 * Раздаёт PS1-ресурспак и шейдерпаки прямо из папки minestom/.
 * Встроенный HTTP-сервер JDK, без зависимостей.
 *
 * GET /                  — страничка с ссылками и картинками лобби
 * GET /pack.zip          — ресурспак (клиент тянет его сам при входе)
 * GET /shaders/ps1-lite.zip
 * GET /shaders/ps1-full.zip
 * GET /preview/lobby.png, /preview/lobby-lantern.png, …  — как выглядит лобби
 */
public final class PackServer {

    private final HttpServer server;
    private final Path root;
    public final int port;
    private String sha1 = "";

    public PackServer(Path gameRoot, int port) throws IOException {
        this.root = gameRoot;
        this.port = port;
        this.server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        server.createContext("/", exchange -> route(exchange));
        server.setExecutor(java.util.concurrent.Executors.newFixedThreadPool(2));
    }

    public void start() {
        server.start();
    }

    public void stop() {
        server.stop(0);
    }

    public Path pack() {
        return root.resolve("resourcepack").resolve("ps1-halloween.zip");
    }

    public boolean hasPack() {
        return Files.isRegularFile(pack());
    }

    /** SHA-1 ресурспака в hex — клиент сверяет его при загрузке. */
    public String hash() {
        if (!sha1.isEmpty()) return sha1;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(Files.readAllBytes(pack()));
            sha1 = HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            sha1 = "";
        }
        return sha1;
    }

    public String urlFor(String host) {
        String h = host == null ? "" : host;
        int colon = h.indexOf('\0');
        if (colon >= 0) h = h.substring(0, colon);
        if (h.isBlank() || h.equalsIgnoreCase("0.0.0.0")) h = "localhost";
        return "http://" + h + ":" + port + "/pack.zip";
    }

    private void route(com.sun.net.httpserver.HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        try {
            switch (path) {
                case "/", "/index.html" -> send(ex, 200, "text/html; charset=utf-8", page().getBytes(StandardCharsets.UTF_8));
                case "/pack.zip" -> file(ex, pack());
                case "/shaders/ps1-lite.zip" -> file(ex, root.resolve("shaderpack").resolve("ps1-lite.zip"));
                case "/shaders/ps1-full.zip" -> file(ex, root.resolve("shaderpack").resolve("ps1-full.zip"));
                case "/pack.png" -> file(ex, root.resolve("resourcepack").resolve("pack.png"));
                case "/preview/lobby.png" -> image(ex, root.resolve("resourcepack").resolve("lobby-lobby.png"));
                case "/preview/lobby-lantern.png" -> image(ex, root.resolve("resourcepack").resolve("lobby-lantern.png"));
                case "/preview/lobby-relay.png" -> image(ex, root.resolve("resourcepack").resolve("lobby-relay.png"));
                case "/preview/lobby-inn.png" -> image(ex, root.resolve("resourcepack").resolve("lobby-inn.png"));
                case "/preview/fire.png" -> image(ex, root.resolve("resourcepack").resolve("preview-anim-campfire_fire.png"));
                case "/version", "/version.json" -> send(ex, 200, "application/json; charset=utf-8",
                        ("""
                                {"minecraft":"26.3","protocol":777,"resource_pack":"97.1",
                                 "pack_format":97,"min_format":[97,0],"max_format":[97,1],
                                 "pack":"%s"}
                                """.formatted(hasPack() ? "готов" : "не собран")).getBytes(StandardCharsets.UTF_8));
                default -> send(ex, 404, "text/plain; charset=utf-8", "нет такого файла".getBytes(StandardCharsets.UTF_8));
            }
        } catch (Exception e) {
            send(ex, 500, "text/plain; charset=utf-8", ("ошибка: " + e).getBytes(StandardCharsets.UTF_8));
        }
    }

    private void file(com.sun.net.httpserver.HttpExchange ex, Path p) throws IOException {
        if (!Files.isRegularFile(p)) {
            send(ex, 404, "text/plain; charset=utf-8", "не собрано — запустите tools/make-assets.sh".getBytes(StandardCharsets.UTF_8));
            return;
        }
        ex.getResponseHeaders().add("Content-Type", "application/zip");
        ex.getResponseHeaders().add("Content-Disposition", "attachment; filename=\"" + p.getFileName() + "\"");
        byte[] data = Files.readAllBytes(p);
        ex.sendResponseHeaders(200, data.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(data);
        }
    }

    private void image(com.sun.net.httpserver.HttpExchange ex, Path p) throws IOException {
        if (!Files.isRegularFile(p)) {
            send(ex, 404, "text/plain; charset=utf-8",
                    "нет картинки — запустите bash tools/make-assets.sh".getBytes(StandardCharsets.UTF_8));
            return;
        }
        byte[] data = Files.readAllBytes(p);
        ex.getResponseHeaders().add("Content-Type", "image/png");
        ex.getResponseHeaders().add("Cache-Control", "no-cache");
        ex.sendResponseHeaders(200, data.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(data);
        }
    }

    private static void send(com.sun.net.httpserver.HttpExchange ex, int code, String type, byte[] body) throws IOException {
        ex.getResponseHeaders().add("Content-Type", type);
        ex.sendResponseHeaders(code, body.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(body);
        }
    }

    private String page() {
        boolean ready = hasPack();
        String size = "—";
        if (ready) {
            try {
                size = String.format(Locale.ROOT, "%.0f КБ", Files.size(pack()) / 1024.0);
            } catch (IOException ignored) {
                // оставляем прочерк
            }
        }
        return """
                <!doctype html><html lang="ru"><head><meta charset="utf-8">
                <title>ТРИ НОЧИ · PS1 пак</title>
                <style>
                  body{margin:0;background:#0b0d14;color:#cfc9b4;font:16px/1.5 system-ui,sans-serif;
                       display:flex;min-height:100vh;align-items:center;justify-content:center}
                  .card{max-width:640px;padding:40px;border:1px solid #23283a;background:#10131d;
                        box-shadow:0 0 60px #2a1030 inset}
                  h1{margin:0 0 4px;font-size:34px;letter-spacing:2px;color:#b8342f}
                  h2{margin:28px 0 8px;font-size:15px;letter-spacing:2px;color:#6f7484;text-transform:uppercase}
                  a{display:block;padding:10px 14px;margin:6px 0;border:1px solid #2c3247;color:#e6ca8a;
                    text-decoration:none;background:#141827}
                  a:hover{border-color:#b8342f;color:#fff}
                  code{color:#7fd1c0}
                  p.small{color:#6f7484;font-size:13px}
                </style></head><body><div class="card">
                <h1>ТРИ НОЧИ</h1>
                <p class="small">PS1-стиль для Minecraft 26.3 · раздаётся сервером Minestom</p>
                <h2>Ресурспак · %s</h2>
                <a href="/pack.zip">ps1-halloween.zip — текстуры 16×16, анимации огня, встроенный шейдер</a>
                <p class="small">Сервер пришлёт его сам при входе. Вручную: <code>%s</code></p>
                <p class="small">Внутри пака уже лежит <b>core-шейдер</b> (<code>shaders/core/lightmap.fsh</code>):
                   холодная луна, тёплые огни и палитра 5 бит на канал включаются сами,
                   без Iris и OptiFine. Это <b>lightmap</b>, а не terrain, поэтому
                   фильтр работает и с Sodium (Fabulously Optimized и подобные сборки).</p>
                <h2>Лобби</h2>
                <a href="/preview/lobby.png">площадь с тремя входами и палым лесом</a>
                <a href="/preview/fire.png">плёнка анимации костра (8 кадров)</a>
                <h2>Шейдерпаки · Iris / OptiFine</h2>
                <a href="/shaders/ps1-lite.zip">ps1-lite.zip — только пост-обработка (безопасно)</a>
                <a href="/shaders/ps1-full.zip">ps1-full.zip — дрожание вершин и аффинные текстуры</a>
                <p class="small">Распаковать в <code>.minecraft/shaderpacks/</code> или положить zip туда же.</p>
                </div></body></html>
                """.formatted(size, ready ? "готов" : "не собран: bash tools/make-assets.sh");
    }
}
