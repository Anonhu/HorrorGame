plugins {
    application
}

group = "ru.nochfonarey"
version = "1.0.0"

repositories {
    // если Minestom 26.3 собран локально: ./gradlew publishToMavenLocal
    mavenLocal()
    mavenCentral()
    // ветка 26_3 ещё не в Maven Central — её собирает JitPack
    maven("https://jitpack.io")
}

dependencies {
    implementation("com.github.Minestom.Minestom:minestom:26_3-SNAPSHOT")
}

java {
    toolchain {
        // Minecraft 26.3 требует Java 25
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

application {
    mainClass.set("ru.nochfonarey.mc.Main")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.release.set(25)
}

tasks.named<JavaExec>("run") {
    standardInput = System.`in`
    jvmArgs("-Dfile.encoding=UTF-8")
}

tasks.register<JavaExec>("selfTest") {
    group = "verification"
    description = "Прогон правил всех трёх режимов без Minecraft"
    mainClass.set("ru.nochfonarey.core.SelfTest")
    classpath = sourceSets["main"].runtimeClasspath
}
