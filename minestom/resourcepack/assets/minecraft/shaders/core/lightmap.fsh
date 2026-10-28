#version 330
#extension GL_ARB_separate_shader_objects : require

// PS1-ночь целиком в одном шейдере: свет.
//
// Почему именно lightmap, а не terrain:
//   * Sodium (а он есть почти в каждом сборке) заменяет рендер чанков и
//     запрещает переопределять shaders/core/terrain.* — пак с terrain.fsh
//     даёт красную ошибку «incompatible with Sodium»;
//   * lightmap в чёрном списке Sodium нет: он рисуется ванильным кодом,
//     Sodium лишь сэмплит получившуюся текстуру (u_LightTex), поэтому
//     фильтр работает и с Sodium, и без него — одинаково.
//
// Объявления ниже совпадают с ванильными 26.3 один в один (это проверяет
// tools/check_core_shaders.py): отличается только тело main().

layout(std140) uniform LightmapInfo {
    float SkyFactor;
    float BlockFactor;
    float NightVisionFactor;
    float DarknessScale;
    float BossOverlayWorldDarkeningFactor;
    float BrightnessFactor;
    vec3 BlockLightTint;
    vec3 SkyLightColor;
    vec3 AmbientColor;
    vec3 NightVisionColor;
} lightmapInfo;

layout(location = 0) in vec2 texCoord;

layout(location = 0) out vec4 fragColor;

float get_brightness(float level) {
    return level / (4.0 - 3.0 * level);
}

vec3 notGamma(vec3 color) {
    float maxComponent = max(max(color.x, color.y), color.z);
    float maxInverted = 1.0f - maxComponent;
    float maxScaled = 1.0f - maxInverted * maxInverted * maxInverted * maxInverted;
    return color * (maxScaled / maxComponent);
}

float parabolicMixFactor(float level) {
    return (2.0 * level - 1.0) * (2.0 * level - 1.0);
}

// 5 бит на канал: 32 ступени, как в палитре PlayStation.
vec3 ps1_quantize(vec3 c) {
    return floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
}

void main() {
    // Calculate block and sky brightness levels based on texture coordinates
    float block_level = floor(texCoord.x * 16) / 15;
    float sky_level = floor(texCoord.y * 16) / 15;

    float block_brightness = get_brightness(block_level) * lightmapInfo.BlockFactor;
    float sky_brightness = get_brightness(sky_level) * lightmapInfo.SkyFactor;

    // Calculate ambient color with or without night vision
    vec3 nightVisionColor = lightmapInfo.NightVisionColor * lightmapInfo.NightVisionFactor;
    vec3 color = max(lightmapInfo.AmbientColor, nightVisionColor);

    // Add sky light
    color += lightmapInfo.SkyLightColor * sky_brightness;

    // Add block light
    vec3 BlockLightColor = mix(lightmapInfo.BlockLightTint, vec3(1.0), 0.9 * parabolicMixFactor(block_level));
    color += BlockLightColor * block_brightness;

    // Apply boss overlay darkening effect
    color = mix(color, color * vec3(0.7, 0.6, 0.6), lightmapInfo.BossOverlayWorldDarkeningFactor);

    // Apply darkness effect scale
    color = color - vec3(lightmapInfo.DarknessScale);

    // Apply brightness
    color = clamp(color, 0.0, 1.0);
    vec3 notGamma = notGamma(color);
    color = mix(color, notGamma, lightmapInfo.BrightnessFactor);

    // ─────────── PS1 ───────────
    // Луна холодная, огонь тёплый: тени уходят в синий, костры — в янтарь.
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 cold = vec3(0.84, 0.93, 1.14);
    vec3 warm = vec3(1.12, 1.01, 0.86);
    color *= mix(cold, warm, smoothstep(0.02, 0.55, lum));

    // Огонь даёт свой, «грязный» оранжевый — так светятся только настоящие
    // источники, а не камень под луной.
    color += lightmapInfo.BlockLightTint * block_brightness * 0.08 * parabolicMixFactor(block_level);

    // Жёсткие ступени вместо плавного градиента: свет ложится полосами.
    color = ps1_quantize(color);

    fragColor = vec4(color, 1.0);
}
