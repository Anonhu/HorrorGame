#version 120

/*
 * Геометрия PS1:
 *  1) вершина прилипает к грубой сетке экрана — мир «дрожит» при ходьбе;
 *  2) UV уезжают в аффинное пространство — текстуры плывут на больших полигонах.
 */

uniform float viewWidth;
uniform float viewHeight;

varying vec2 texcoord;
varying vec3 uvAffine;
varying vec2 lmcoord;
varying vec4 tint;

void main() {
    gl_Position = ftransform();

    // ── 1. снеппинг вершин ────────────────────────────────────────────
    vec2 grid = vec2(max(viewWidth, 320.0), max(viewHeight, 180.0)) * 0.34;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    ndc = floor(ndc * grid + 0.5) / grid;
    gl_Position.xy = ndc * gl_Position.w;

    // ── 2. аффинные UV ────────────────────────────────────────────────
    vec4 uv = gl_TextureMatrix[0] * gl_MultiTexCoord0;
    texcoord = uv.xy;
    float w = max(gl_Position.w, 0.0001);
    uvAffine = vec3(uv.xy * w, w);

    lmcoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).st;
    tint = gl_Color;
}
