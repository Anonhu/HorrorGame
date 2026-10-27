package net.minestom.server;
public sealed interface Auth {
    record Offline() implements Auth { }
}
