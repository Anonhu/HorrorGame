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

    // Лобби и комнаты ожидания
    String COBWEB = "cobweb";
    String MOSSY_BRICK = "mossy_brick";       // замшелые кирпичи
    String MOSS = "moss";
    String SOUL_CAMPFIRE = "soul_campfire";
    String IRON_CHAIN = "iron_chain";
    String BARREL = "barrel";
    String BOOKSHELF = "bookshelf";
    String PUMPKIN = "pumpkin";               // вырезанная тыква
    String JACK = "jack";                     // светящаяся тыква
    String HAY = "hay";
    String PALE_LOG = "pale_log";
    String DEAD_BUSH = "dead_bush";
    String SKULL = "skull";                   // череп на столбе
    String LANTERN = "lantern";
    String SOUL_LANTERN = "soul_lantern";
    String TORCH = "torch";
    String SOUL_TORCH = "soul_torch";
    String FERN = "fern";
    String SCULK_VEIN = "sculk_vein";
    String LODESTONE = "lodestone";

    // псевдонимы для читаемости раскладки (те же блоки, другие имена)
    String TILES = "tiles";            // deepslate_tiles
    String BRICK = "brick";            // stone_bricks
    String PLANKS_DARK = "planks_dark";
    String PLANKS_SPRUCE = "planks_spruce";
    String LOG_DARK = "log_dark";
    String LOG_PALE = "log_pale";
    String IRON_BARS = "iron_bars";
    String GRASS_BLOCK = "grass_block";
    String WOOL_RED = "wool_red";
    String SEA_LANTERN = "sea_lantern";
    /** Невидимая стена: лобби и комнаты ожидания не выпускают в пустоту. */
    String BARRIER = "barrier";
}
