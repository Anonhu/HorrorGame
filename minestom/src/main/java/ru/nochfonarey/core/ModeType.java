package ru.nochfonarey.core;

/** Три режима хаба. */
public enum ModeType {
    LANTERN("ФОНАРЩИКИ", 2, 16, "PvPvE: костры, дрова, тайная Тень"),
    RELAY("ЭСТАФЕТА СВЕТА", 2, 16, "кооп: один фонарь, Собиратель, алтарь"),
    INN("ПОСТОЯЛЫЙ ДВОР", 3, 16, "дедукция: свечи, улики, «не гость»");

    public final String title;
    public final int min;
    public final int max;
    public final String tag;

    ModeType(String title, int min, int max, String tag) {
        this.title = title;
        this.min = min;
        this.max = max;
        this.tag = tag;
    }

    public static ModeType parse(String s) {
        if (s == null) return null;
        switch (s.toLowerCase()) {
            case "lantern": case "фонарщики": case "1": return LANTERN;
            case "relay": case "эстафета": case "2": return RELAY;
            case "inn": case "двор": case "3": return INN;
            default: return null;
        }
    }
}
