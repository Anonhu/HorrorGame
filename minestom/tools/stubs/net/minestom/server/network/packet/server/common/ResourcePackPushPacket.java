package net.minestom.server.network.packet.server.common;
import net.kyori.adventure.text.Component;
import net.minestom.server.network.packet.server.SendablePacket;
import java.util.UUID;
public record ResourcePackPushPacket(UUID id, String url, String hash, boolean forced, Component prompt)
        implements SendablePacket { }
