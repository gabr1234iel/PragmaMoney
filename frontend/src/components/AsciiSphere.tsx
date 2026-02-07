"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AsciiRenderer } from "@react-three/drei";
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
  vec3 finalColor = mix(color, highlightColor, highlight * 0.5 + interactionGlow);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

function Sphere({ color = "#FF4D4D" }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const hoverRef = useRef(0);
    const raycaster = useMemo(() => new THREE.Raycaster(), []);
    const dummyVec = useMemo(() => new THREE.Vector3(), []);

    // Initial color for the uniforms
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

    useFrame((state: any) => {
        if (!meshRef.current) return;

        // SCROLL ROTATION
        // We read scroll directly to avoid re-renders
        // Adjust multiplier for sensitivity
        const scrollY = window.scrollY;
        meshRef.current.rotation.x = scrollY * 0.002;
        meshRef.current.rotation.y = scrollY * 0.001;

        // ANIMATE SHADER
        const material = meshRef.current.material as THREE.ShaderMaterial;
        material.uniforms.uTime.value = state.clock.getElapsedTime() * 0.5; // Slightly faster for ASCII movement

        // RAYCASTING RIPPLES
        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0) {
            dummyVec.copy(intersects[0].point);
            meshRef.current.worldToLocal(dummyVec);
            material.uniforms.uPoint.value.lerp(dummyVec, 0.1);
            hoverRef.current = 1;
        } else {
            hoverRef.current = 0;
        }

        material.uniforms.uHover.value = THREE.MathUtils.lerp(
            material.uniforms.uHover.value,
            hoverRef.current,
            0.05
        );
    });

    return (
        <mesh ref={meshRef} scale={2.2}>
            <icosahedronGeometry args={[1, 64]} />
            <shaderMaterial
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                // Wireframe can look cool in ascii, but solid is usually better for 'density'
                wireframe={false}
            />
        </mesh>
    );
}

export default function AsciiSphere() {
    return (
        <div className="w-full h-full bg-black relative">
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <color attach="background" args={['black']} />
                <ambientLight />
                <pointLight position={[10, 10, 10]} />

                <Sphere color="#FF4D4D" />

                <AsciiRenderer
                    fgColor="#FF4D4D"
                    bgColor="transparent"
                    characters=" .:-+*=%@#"
                    invert={true}
                    resolution={0.18} // Lower density for retro feel, higher for detail
                />
            </Canvas>
        </div>
    );
}
