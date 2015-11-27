precision highp float;

// Useful math constants
const float PI = 3.14159265;
const float DOUBLE_PI = 6.2831853;
const float INVERSE_PI = 0.318309886;
const float EPSILON = 0.001;

// Settings constants
const float ENVIRONMENT_IOR = 1.0;

// Uniforms
uniform mat4 u_ViewWorldMatrix;

// Environment uniforms
uniform samplerCube u_EnvMap;
uniform sampler2D u_Lighting;

// Material uniforms
uniform vec3 u_DiffuseColor;
uniform vec3 u_SpecularColor;
uniform float u_IOR;
uniform float u_Glossiness;

uniform sampler2D u_DiffuseTexture;
uniform sampler2D u_SpecularTexture;
uniform sampler2D u_GlossinessTexture;
uniform sampler2D u_BumpTexture;

// Varyings
varying vec3 vr_ViewPosition;
varying vec2 vr_TexCoords;
varying vec3 vr_ViewNormal;
varying vec3 vr_ViewTangent;
varying vec3 vr_ViewBitangent;

////////////////////////////////////////////////////////////////////////////////
// Utility functions
////////////////////////////////////////////////////////////////////////////////

// http://stackoverflow.com/questions/12964279/whats-the-origin-of-this-glsl-rand-one-liner
float rand(vec2 coords){
  return fract(sin(dot(coords.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// http://en.wikipedia.org/wiki/SRGB
vec3 linearToSRGB(vec3 linearRGB) {
    const vec3 INVERSE_GAMMA = vec3(1.0 / 2.4);
    const vec3 K0 = vec3(0.0031308);
    const float ALPHA = 0.055;
    const float PHI = 12.92;
    
    bvec3 lessThanK0 = lessThanEqual(linearRGB, K0);
    
    vec3 sRGBLessThanK0 = PHI * linearRGB;
    vec3 sRGBLargerThanK0 = (1.0 + ALPHA) * pow(linearRGB, vec3(INVERSE_GAMMA)) - ALPHA;
    
    vec3 sRGB = mix(sRGBLargerThanK0, sRGBLessThanK0, vec3(lessThanK0));
    return sRGB;
}

// http://en.wikipedia.org/wiki/SRGB
vec3 sRGBToLinear(vec3 sRGB) {
    const vec3 GAMMA = vec3(2.4);
    const vec3 K0 = vec3(0.04045);
    const float ALPHA = 0.055;
    const float INVERSE_PHI = 1.0 / 12.92;
    
    bvec3 lessThanK0 = lessThanEqual(sRGB, K0);
    
    vec3 linearRGBLessThanK0 = INVERSE_PHI * sRGB;
    vec3 linearRGBLargerThanK0 = pow((sRGB + ALPHA) / (1.0 + ALPHA), GAMMA);
	
    vec3 linearRGB = mix(linearRGBLargerThanK0, linearRGBLessThanK0, vec3(lessThanK0));
    return linearRGB;
}

////////////////////////////////////////////////////////////////////////////////
// Shading functions
////////////////////////////////////////////////////////////////////////////////

// Baked raw lighting map
vec3 getIncidentLighting() {
	return vec3(texture2D(u_Lighting, vr_TexCoords));
}

// IBL. Use HDR for best results.
vec3 getLightingFromDirection(vec3 vInDirection) {
	vec3 wInDirection = vec3(u_ViewWorldMatrix * vec4(vInDirection, 0.0));
	vec3 envSample = vec3(textureCube(u_EnvMap, wInDirection));	
	return envSample;
}

// https://en.wikipedia.org/wiki/Fresnel_equations
float getFresnelReflectionWeight(vec3 vOutDirection, vec3 vNormal, float eta) {
	float cosThetaEnter = clamp(dot(vOutDirection, vNormal), 0.0, 1.0);
	float sinThetaEnter = sqrt(1.0 - cosThetaEnter * cosThetaEnter);
	float sinThetaExit = clamp(eta * sinThetaEnter, 0.0, 1.0);
	float cosThetaExit = sqrt(1.0 - sinThetaExit * sinThetaExit);

	float sReflectanceWeight = (eta * cosThetaEnter - cosThetaExit) / (eta * cosThetaEnter + cosThetaExit);
	float pReflectanceWeight = (eta * cosThetaExit - cosThetaEnter) / (eta * cosThetaExit + cosThetaEnter);
	float unpolarizedReflectionWeight = 0.5 * (sReflectanceWeight * sReflectanceWeight + pReflectanceWeight * pReflectanceWeight);

	return unpolarizedReflectionWeight;
}

////////////////////////////////////////////////////////////////////////////////
// GGX functions
// Burley, 2012, Physically-Based Shading at Disney, Section B.2
// Walter, 2007, Microfacet Models for Refraction through Rough Surfaces
////////////////////////////////////////////////////////////////////////////////

vec3 getGGXMicroNormal(float xi1, float xi2, float glossiness) {
	float phi = DOUBLE_PI * xi1;
	float tanTheta = sqrt(xi2 / (1.0 - xi2));
	
	vec3 microNormal = 
		tanTheta * glossiness * cos(phi) * vr_ViewTangent +
		tanTheta * glossiness * sin(phi) * vr_ViewBitangent +
		vr_ViewNormal;
		
	microNormal = normalize(microNormal);
	
	return microNormal;
}

float GGXShadowingMasking(vec3 vOutDirection, vec3 vMicroNormal, vec3 vInDirection, float glossiness) {
	float glossinessSquared = glossiness * glossiness;
	
	float cosThetaL = dot(vInDirection, vMicroNormal);
	float cosThetaLSquared = cosThetaL * cosThetaL;
	float tanThetaLSquared = 1.0 / cosThetaLSquared - 1.0;
	float shadowing = 2.0 / (1.0 + sqrt(1.0 + glossinessSquared * tanThetaLSquared));
	
	float cosThetaV = dot(vOutDirection, vMicroNormal);
	float cosThetaVSquared = cosThetaV * cosThetaV;
	float tanThetaVSquared = 1.0 / cosThetaVSquared - 1.0;
	float masking = 2.0 / (1.0 + sqrt(1.0 + glossinessSquared * tanThetaVSquared));
	
	return shadowing * masking;
}

float GGXMicronormalDistribution(vec3 vNormal, vec3 vMicroNormal, float glossiness) {
	float cosThetaM = dot(vNormal, vMicroNormal);
	float cosThetaMSquared = cosThetaM * cosThetaM;
	float sinThetaMSquared = 1.0 - cosThetaMSquared;
	float glossinessSquared = glossiness * glossiness;
	
	float num = INVERSE_PI * glossinessSquared;
	float sqrtDen = (sinThetaMSquared + glossinessSquared * cosThetaMSquared);
	
	return num / (sqrtDen * sqrtDen);
}

float GGXBRDFValue(vec3 vOutDirection, vec3 vNormal, vec3 vMicroNormal, vec3 vInDirection, float ior, float glossiness) {
	float F = getFresnelReflectionWeight(vOutDirection, vMicroNormal, ENVIRONMENT_IOR / ior);
	float G = GGXShadowingMasking(vOutDirection, vMicroNormal, vInDirection, glossiness);
	float D = GGXMicronormalDistribution(vNormal, vMicroNormal, glossiness);
	float dotNL = dot(vNormal, vInDirection);
	float dotNV = dot(vNormal, vOutDirection);
	
	return 0.25 * (F * G * D) / (dotNL * dotNV);
}

// Integrates the specular microfacet BRDF using Monter Carlo
vec3 getSpecularContribution(vec3 vOutDirection, vec3 vNormal, float ior, float glossiness) {
	vec3 specularContribution = vec3(0.0);
    
	vec2 randomSeed = vr_ViewPosition.xy;
	
    const int SAMPLE_COUNT = 16;
	const float INVERSE_SAMPLE_COUNT = 1.0 / float(SAMPLE_COUNT);
	
    for (int sampleIndex = 0; sampleIndex < SAMPLE_COUNT; ++sampleIndex) {
		randomSeed = fract(randomSeed + INVERSE_SAMPLE_COUNT);
		float xi1 = rand(randomSeed) + EPSILON;
		float xi2 = rand(randomSeed.yx) + EPSILON;
		
		// Generate light sample direction
		vec3 vSampleMicroNormal = getGGXMicroNormal(xi1, xi2, glossiness);
		vec3 vSampleReflection = reflect(-vOutDirection, vSampleMicroNormal);

        // Evaluate the integral argument
		float brdfValue = GGXBRDFValue(vOutDirection, vNormal, vSampleMicroNormal, vSampleReflection, ior, glossiness);
		vec3 incidentLight = getLightingFromDirection(vSampleReflection);
		float lambertTerm = dot(vSampleReflection, vNormal);
		
		// Evaluate the sample's probability
		float sampleProbability = GGXMicronormalDistribution(vNormal, vSampleMicroNormal, glossiness) * dot(vNormal, vSampleMicroNormal);
		
        specularContribution += ((brdfValue * incidentLight * lambertTerm) / sampleProbability);
    }
	
    specularContribution *= INVERSE_SAMPLE_COUNT;
	
	return specularContribution;
}

void main() {
    // Calculate the diffuse contribution
    vec3 diffuseContribution = getIncidentLighting();
    diffuseContribution *= u_DiffuseColor;
	
	// Calculate the specular reflection weight
    vec3 vOutDirection = -normalize(vr_ViewPosition);
    float specularWeight = getFresnelReflectionWeight(vOutDirection, vr_ViewNormal, ENVIRONMENT_IOR / u_IOR);
    
	// Calculate the specular contribution
    vec3 specularContribution = getSpecularContribution(vOutDirection, vr_ViewNormal, u_IOR, 1.0 - u_Glossiness);
    specularContribution *= u_SpecularColor;
	
    // Energy preservation
    vec3 result = mix(diffuseContribution, specularContribution, specularWeight);
    
	// Convert to sRGB
    result = linearToSRGB(result);
    
    gl_FragColor = vec4(result, 1.0);
}