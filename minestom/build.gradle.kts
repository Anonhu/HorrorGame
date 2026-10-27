plugins {
    application
}

group = "ru.leshorror"
version = "0.1.0"

repositories {
    mavenCentral()
    maven("https://jitpack.io")   // needed for the unreleased 26.3 branch
}

dependencies {
    // ── Minecraft 26.3 "Wilderness Bound" ────────────────────────────────
    // Minestom has not published 26.3 to Maven Central yet (PR #3369).
    // JitPack builds the `26_3` branch. If it fails to build, comment the
    // line below and use the latest stable 26.2 release instead:
    //   implementation("net.minestom:minestom:2026.10.07-26.2")
    implementation("com.github.Minestom.Minestom:minestom:26_3-SNAPSHOT")
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25)) // Minecraft 26.x runs on Java 25
    }
}

application {
    mainClass.set("ru.leshorror.Main")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}
