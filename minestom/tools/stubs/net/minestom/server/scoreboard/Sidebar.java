package net.minestom.server.scoreboard;
import net.kyori.adventure.text.Component;
import net.minestom.server.entity.Player;
import java.util.Set;
public class Sidebar {
    public Sidebar(Component title) { }
    public void createLine(ScoreboardLine line) { }
    public void updateLineContent(String id, Component content) { }
    public void removeLine(String id) { }
    public boolean addViewer(Player player) { return true; }
    public boolean removeViewer(Player player) { return true; }
    public Set<ScoreboardLine> getLines() { return null; }
    public static class ScoreboardLine {
        public ScoreboardLine(String id, Component content, int line) { }
        public String getId() { return null; }
    }
}
