/**
 * GLSL Shaders for Photorealistic 3D Earth Rendering
 *
 * Includes:
 * 1. Earth Surface Shader: Day/night Blue Marble blending, UV-gradient topographic bump mapping,
 *    oceanic specular sun-glint, twilight atmospheric scattering, and internal Fresnel horizon haze.
 * 2. Outer Atmosphere Halo Shader: Rayleigh-inspired limb scattering rendered on a back-facing
 *    enclosing sphere.
 */

export const earthVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 mvPosition = viewMatrix * worldPosition;
    vViewPosition = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const earthFragmentShader = /* glsl */ `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform sampler2D bumpTexture;
  uniform sampler2D specularTexture;
  uniform vec3 sunDirection;
  uniform float bumpScale;
  uniform float ambientStrength;

  varying vec2 vUv;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  // Perturb normal using heightmap UV derivatives in screen space
  vec3 perturbNormalArb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy) {
    vec3 vSigmaX = dFdx(surfPos);
    vec3 vSigmaY = dFdy(surfPos);
    vec3 vN = surfNorm;
    vec3 R1 = cross(vSigmaY, vN);
    vec3 R2 = cross(vN, vSigmaX);
    float fDet = dot(vSigmaX, R1);
    if (abs(fDet) < 1e-6) return vN;
    vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
    return normalize(abs(fDet) * vN - vGrad);
  }

  void main() {
    vec3 baseNormal = normalize(vWorldNormal);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 lightDir = normalize(sunDirection);

    // Topographic bump mapping from elevation texture
    vec2 texel = vec2(1.0 / 4096.0, 1.0 / 2048.0);
    float hCenter = texture2D(bumpTexture, vUv).r;
    float hRight = texture2D(bumpTexture, vUv + vec2(texel.x, 0.0)).r;
    float hUp = texture2D(bumpTexture, vUv + vec2(0.0, texel.y)).r;
    vec2 dHdxy = vec2(hRight - hCenter, hUp - hCenter) * bumpScale * 35.0;
    vec3 normal = perturbNormalArb(vWorldPosition, baseNormal, dHdxy);

    // Sample satellite textures
    vec3 dayColor = texture2D(dayTexture, vUv).rgb;
    vec3 nightColor = texture2D(nightTexture, vUv).rgb;
    float waterMask = texture2D(specularTexture, vUv).r;

    // Refine ocean vs land appearance for physical realism
    // Deepen ocean tones slightly for scientific satellite aesthetic
    vec3 refinedDay = mix(dayColor * 1.04, dayColor * vec3(0.78, 0.88, 1.05), waterMask * 0.45);

    // Illumination geometry
    float ndotl = dot(normal, lightDir);
    float smoothNdotL = dot(baseNormal, lightDir);

    // Day / Night transition factor across the terminator
    float dayFactor = smoothstep(-0.16, 0.22, smoothNdotL);
    float diffuse = max(ndotl, 0.0);

    // Subtle warm sunset/twilight band along the terminator
    float twilightBand = smoothstep(-0.18, 0.04, smoothNdotL) * (1.0 - smoothstep(0.04, 0.28, smoothNdotL));
    vec3 twilightTint = vec3(0.85, 0.42, 0.18) * twilightBand * 0.28;

    // Specular sun reflection on oceans (restrained & realistic)
    vec3 halfDir = normalize(lightDir + viewDir);
    float specAngle = max(dot(normal, halfDir), 0.0);
    float specOcean = pow(specAngle, 48.0) * 0.42 * waterMask;
    float specLand = pow(specAngle, 16.0) * 0.03 * (1.0 - waterMask);
    vec3 specular = vec3(1.0, 0.96, 0.88) * (specOcean + specLand) * dayFactor;

    // Combine sunlit surface
    vec3 litDay = refinedDay * (ambientStrength + (1.0 - ambientStrength) * pow(diffuse, 0.88)) + specular + twilightTint;

    // Night side: warm golden city lights + faint starlit terrain silhouette
    vec3 warmNightLights = pow(nightColor, vec3(1.25)) * vec3(1.35, 1.05, 0.65) * 1.35;
    vec3 darkAmbient = refinedDay * ambientStrength * 0.45;
    vec3 nightSurface = darkAmbient + warmNightLights * (1.0 - waterMask * 0.85);

    // Blend day and night across the terminator
    vec3 surfaceColor = mix(nightSurface, litDay, dayFactor);

    // Atmospheric Rayleigh horizon haze on the globe surface
    float fresnel = 1.0 - max(dot(viewDir, baseNormal), 0.0);
    float rim = pow(clamp(fresnel, 0.0, 1.0), 3.2);
    float sunFacingAtmos = smoothstep(-0.35, 0.45, smoothNdotL);
    vec3 atmosColor = mix(vec3(0.05, 0.14, 0.32), vec3(0.28, 0.58, 0.98), sunFacingAtmos);
    surfaceColor += atmosColor * rim * (0.18 + 0.48 * sunFacingAtmos);

    gl_FragColor = vec4(surfaceColor, 1.0);
  }
`;

export const atmosphereVertexShader = /* glsl */ `
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const atmosphereFragmentShader = /* glsl */ `
  uniform vec3 sunDirection;
  uniform vec3 atmosphereColor;
  uniform float atmosphereStrength;

  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    vec3 normal = normalize(vWorldNormal);

    // BackSide sphere: normal points outward, viewDir points toward camera
    float viewDot = dot(viewDir, -normal);
    float rim = clamp(viewDot, 0.0, 1.0);

    // Smooth exponential falloff at the outer atmospheric edge
    float halo = pow(rim, 2.6) * (1.0 - smoothstep(0.62, 0.95, rim));

    // Sun orientation modulates scattering brightness around the limb
    float sunInfluence = smoothstep(-0.45, 0.55, dot(normal, normalize(sunDirection)));
    vec3 scatterColor = mix(vec3(0.08, 0.22, 0.52), atmosphereColor, sunInfluence);

    float alpha = halo * atmosphereStrength * (0.25 + 0.75 * sunInfluence);
    gl_FragColor = vec4(scatterColor, clamp(alpha, 0.0, 0.85));
  }
`;

