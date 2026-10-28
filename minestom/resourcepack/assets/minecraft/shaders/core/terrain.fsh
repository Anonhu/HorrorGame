#version 330
#extension GL_ARB_separate_shader_objects : require

#include <minecraft:fog.glsl>
#include <minecraft:globals.glsl>
#include <minecraft:texture_sampling.glsl>
#include <minecraft:oit.glsl>
#include <minecraft:terrainglobals.glsl>
#ifndef MULTIDRAW_TERRAIN
    #include <minecraft:chunksection.glsl>
#endif

uniform sampler2D Sampler0;

layout(location = 0) in float sphericalVertexDistance;
layout(location = 1) in float cylindricalVertexDistance;
layout(location = 2) in vec4 vertexColor;
layout(location = 3) in vec2 texCoord0;
layout(location = 4) in float chunkVisibility;

#ifndef OIT_ALPHA_ONLY
layout(location = 0) out vec4 fragColor;
#endif

vec4 calculateFinalColor(vec4 color) {
    #ifdef OIT_ACCUMULATE
    color = sampleColorForAccumulation(color);
    vec4 fogColor = vec4(FogColor.rgb * color.a, FogColor.a);
    #else
    vec4 fogColor = FogColor;
    #endif
    return apply_fog(color, sphericalVertexDistance, cylindricalVertexDistance, FogEnvironmentalStart, FogEnvironmentalEnd, FogRenderDistanceStart, FogRenderDistanceEnd, fogColor);
}

// ─── PS1 «core» ───────────────────────────────────────────────────────────
// Встроенный шейдер пака: работает без Iris и OptiFine, потому что это
// обычный core-шейдер Minecraft 26.3. Ни одного нового uniform/атрибута не
// объявляет — только перекрашивает готовый цвет в самом конце, поэтому
// сломать рендер не может (это проверяет tools/check_core_shaders.py).
const float PS1_BAYER[16] = float[16](
     0.0,  8.0,  2.0, 10.0,
    12.0,  4.0, 14.0,  6.0,
     3.0, 11.0,  1.0,  9.0,
    15.0,  7.0, 13.0,  5.0);

vec3 ps1_grade(vec3 c) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    // холодная ночь, тёплые огни
    c = mix(vec3(l), c, 1.14);
    c *= mix(vec3(0.88, 0.93, 1.07), vec3(1.08, 1.01, 0.92), smoothstep(0.08, 0.72, l));
    // мягкие сканлайны: 0.05 — чтобы не рябило на 4K
    c *= 1.0 - 0.05 * (0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159265));
    // 5 бит на канал с упорядоченным джиттером — палитра PlayStation
    ivec2 p = ivec2(mod(gl_FragCoord.xy, 4.0));
    float d = PS1_BAYER[p.y * 4 + p.x] / 15.0 - 0.5;
    return floor(c * 31.0 + d + 0.5) / 31.0;
}

void main() {
    vec4 color = (UseRgss == 1 ? sampleRGSS(Sampler0, texCoord0, 1.0f / TextureSize) : sampleNearest(Sampler0, texCoord0, 1.0f / TextureSize)) * vertexColor;
    #ifndef OIT_ALPHA_ONLY
    color = mix(FogColor * vec4(1, 1, 1, color.a), color, chunkVisibility);
    #endif
    #ifdef ALPHA_CUTOUT
    if (color.a < ALPHA_CUTOUT) {
        discard;
    }
    #endif

    #ifdef OIT_ALPHA_ONLY
    executeAlphaOnlyPhase(gl_FragCoord.z, color.a);
    #else
    vec4 ps1Color = calculateFinalColor(color);
    #ifndef OIT_ACCUMULATE
    ps1Color.rgb = ps1_grade(ps1Color.rgb);
    #endif
    fragColor = ps1Color;
    #endif
}
