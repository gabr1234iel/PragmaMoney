"use client";

import { useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const vertexShader = `
uniform float uTime;
uniform float uHover;
uniform vec3 uPoint; // Interaction point in 3D space

varying vec2 vUv;
varying float vDisplacement;
varying float vDist; // Distance to interaction point

// Simplex noise function
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; 
  vec3 x3 = x0 - D.yyy;      

  // Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 0.142857142857; 
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); 

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  vUv = uv;
  vec3 pos = position;
  
  // Calculate distance from interaction point
  float dist = distance(pos, uPoint);
  vDist = dist; // Pass to fragment shader
  
  // Base Noise
  float noiseFreq = 1.5;
  float noiseAmp = 0.15;
  vec3 noisePos = vec3(pos.x * noiseFreq + uTime * 0.5, pos.y * noiseFreq + uTime * 0.5, pos.z * noiseFreq);
  float noise = snoise(noisePos);
  
  // Interaction Ripple
  // Create a ripple effect that decays with distance
  float rippleFreq = 10.0;
  float rippleAmp = 0.4 * smoothstep(1.0, 0.0, dist); // Only affects area near cursor
  float ripple = sin(dist * rippleFreq - uTime * 5.0) * rippleAmp;
  
  // Combine effects: Base Noise + Ripple
  float finalDisplacement = noise * noiseAmp + ripple;
  
  vDisplacement = finalDisplacement;
  vec3 newPosition = position + normal * finalDisplacement;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uColor;
varying float vDisplacement;
varying float vDist; // Use distance for coloring

void main() {
  vec3 color = uColor;
  
  // Highlight peaks
  float highlight = smoothstep(0.0, 0.5, vDisplacement);
  
  // Add extra glow near interaction point
  float interactionGlow = smoothstep(1.0, 0.0, vDist) * 0.5;
  
  vec3 highlightColor = vec3(1.0, 1.0, 1.0);
  
  // Mix colors: Base + Highlight + Interaction Glow
  vec3 finalColor = mix(color, highlightColor, highlight * 0.2 + interactionGlow);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

interface WavySphereProps {
    color?: string;
}

export default function WavySphere({ color = "#FF4D4D" }: WavySphereProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const hoverRef = useRef(0);
    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const dummyVec = useMemo(() => new THREE.Vector3(), []);

    const uniforms = useMemo(
        () => ({
            uTime: { value: 0 },
            uHover: { value: 0 },
            uPoint: { value: new THREE.Vector3(0, 0, 0) }, // Interaction point
            uColor: { value: new THREE.Color(color) },
        }),
        [color]
    );

    const { camera, pointer } = useThree();

    useFrame((state) => {
        if (meshRef.current) {
            // Rotation
            meshRef.current.rotation.y += 0.001;
            meshRef.current.rotation.x += 0.0005;

            const material = meshRef.current.material as THREE.ShaderMaterial;
            material.uniforms.uTime.value = state.clock.getElapsedTime() * 0.2;

            // Raycasting for accurate interaction
            raycaster.setFromCamera(pointer, camera);
            const intersects = raycaster.intersectObject(meshRef.current);

            if (intersects.length > 0) {
                // If cursor is over sphere, update interaction point
                // Transform world point to local space for shader if needed, 
                // but here we can just use local point from intersection
                // Actually, vertex shader uses 'position' which is local.
                // So we need interaction point in LOCAL space.

                // intersects[0].point is World Space.
                // We need to convert it to Local Space.
                dummyVec.copy(intersects[0].point);
                meshRef.current.worldToLocal(dummyVec);

                // Smoothly move uPoint to new interaction point
                material.uniforms.uPoint.value.lerp(dummyVec, 0.1);

                // Trigger hover effect
                hoverRef.current = 1;
            } else {
                // If not hovering, move point away or keep it last known
                hoverRef.current = 0;
            }

            material.uniforms.uHover.value = THREE.MathUtils.lerp(
                material.uniforms.uHover.value,
                hoverRef.current,
                0.05
            );
        }
    });

    return (
        <mesh
            ref={meshRef}
            scale={1.8}
        >
            <icosahedronGeometry args={[1, 100]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                wireframe={true}
                wireframeLinewidth={1.5}
            />
        </mesh>
    );
}
