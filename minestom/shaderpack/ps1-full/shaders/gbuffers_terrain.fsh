#version 120

uniform sampler2D gtexture;
uniform sampler2D lightmap;

varying vec2 texcoord;
varying vec3 uvAffine;
varying vec2 lmcoord;
varying vec4 tint;

void main() {
    // аффинное деление: получаем «плывущую» текстуру PS1
    vec2 uv = uvAffine.xy / max(uvAffine.z, 0.0001);

    vec4 albedo = texture2D(gtexture, uv);
    if (albedo.a < 0.5) discard;

    vec3 light = texture2D(lightmap, lmcoord).rgb;
    vec3 col = albedo.rgb * tint.rgb * light;

    gl_FragData[0] = vec4(col, albedo.a);
}
