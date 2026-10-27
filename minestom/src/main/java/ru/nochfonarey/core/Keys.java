package ru.nochfonarey.core;

/** Блоки, которыми пользуются режимы. Слой Minecraft переводит их в настоящие Block. */
public interface Keys {
    String AIR = "air";
    String GRASS = "grass";
    String DIRT = "dirt";
    String STONE = "stone";
    String PATH = "path";

    // Фонарщики
    String FIRE_ON = "fire_on";        // горящий костёр
    String FIRE_OFF = "fire_off";      // потухший костёр
    String LOGS = "logs";              // куча дров
    String TRUNK = "trunk";
    String LEAVES = "leaves";
    String BUSH = "bush";
    String GRABBER = "grabber";        // «Тянущиеся» — руки из земли
    String BODY = "body";              // тело убитого

    // Эстафета
    String WATER = "water";
    String SAND = "sand";
    String CHAPEL = "chapel";
    String ALTAR = "altar";
    String DECOY = "decoy";            // ложный огонёк
    String WISP = "wisp";              // след Собирателя

    // Двор
    String FLOOR_HALL = "floor_hall";
    String FLOOR_ROOM = "floor_room";
    String FLOOR_CELLAR = "floor_cellar";
    String WALL = "wall";
    String DOOR = "door";
    String DOOR_LOCKED = "door_locked";
    String CANDLE_ON = "candle_on";
    String CANDLE_OFF = "candle_off";
    String CARPET = "carpet";
}
