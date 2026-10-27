package net.minestom.server.network.packet.server.play;
import net.minestom.server.network.packet.server.SendablePacket;
import net.minestom.server.particle.Particle;
public class ParticlePacket implements SendablePacket {
    public ParticlePacket(Particle particle, double x, double y, double z,
                          float offsetX, float offsetY, float offsetZ, float maxSpeed, int particleCount) { }
}
