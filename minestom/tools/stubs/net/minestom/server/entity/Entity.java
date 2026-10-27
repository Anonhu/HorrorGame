package net.minestom.server.entity;
import net.minestom.server.coordinate.Pos;
import net.minestom.server.instance.Instance;
public class Entity {
    public void setInstance(Instance instance, Pos pos) { }
    public Instance getInstance() { return null; }
    public void teleport(Pos pos) { }
    public Pos getPosition() { return null; }
    public boolean isSneaking() { return false; }
}
