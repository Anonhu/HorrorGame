#version 120

uniform sampler2D colortex0;
uniform float viewWidth;
uniform float viewHeight;

float bayer2(vec2 a) {
    a = floor(a);
    return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

float bayer4(vec2 a) {
    return bayer2(0.5 * a) * 0.25 + bayer2(a);
}

void main() {
    vec2 uv = gl_FragCoord.xy / vec2(viewWidth, viewHeight);
    vec3 col = texture2D(colortex0, uv).rgb;

    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, 1.18);
    col *= mix(vec3(0.84, 0.90, 1.08), vec3(1.08, 1.02, 0.92), smoothstep(0.12, 0.80, l));

    vec2 q = uv - vec2(0.5);
    col *= 1.0 - dot(q, q) * 0.60;

    col *= 0.94 + 0.06 * sin(gl_FragCoord.y * 3.14159265);

    float d = bayer4(gl_FragCoord.xy);
    col = floor(col * 31.0 + d) / 31.0;

    gl_FragColor = vec4(col, 1.0);
}
