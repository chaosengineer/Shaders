precision highp float;

// Uniforms
uniform mat4 u_ProjectionMatrix;
uniform mat4 u_ModelViewMatrix;
uniform mat3 u_NormalMatrix;

// Attributes
attribute vec3 a_Position;
attribute vec3 a_Normal;
attribute vec4 a_Tangent;
attribute vec2 a_UV;

// Varyings
varying vec3 vr_ViewPosition;
varying vec2 vr_TexCoords;
varying vec3 vr_ViewNormal;
varying vec3 vr_ViewTangent;
varying vec3 vr_ViewBitangent;

void main(void) {
    vec4 vPosition = u_ModelViewMatrix * vec4(a_Position, 1.0);
    vr_ViewPosition = vec3(vPosition);
    
	vr_TexCoords = a_UV;
	
    vr_ViewNormal = normalize(u_NormalMatrix * a_Normal);
    
    vr_ViewTangent = normalize(u_NormalMatrix * (a_Tangent.xyz * a_Tangent.w));
    
    vr_ViewBitangent = cross(vr_ViewNormal, vr_ViewTangent);
    
	gl_Position = u_ProjectionMatrix * vPosition;
}
