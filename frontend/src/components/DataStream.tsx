"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as THREE from "three";

// Generate random "data" strings
const generateDataLine = () => {
    const types = ["TX", "HASH", "BLOCK", "SYNC", "ACK"];
    const type = types[Math.floor(Math.random() * types.length)];
    const hash = Math.random().toString(36).substring(2, 10).toUpperCase();
    const val = (Math.random() * 1000).toFixed(2);
    return `${type}::0x${hash} >> ${val}`;
};

const DataLine = ({ position, text, opacity }: { position: [number, number, number]; text: string; opacity: number }) => {
    return (
        <Text
            position={position}
            fontSize={0.15}
            font="https://fonts.gstatic.com/s/robotomono/v22/L0x5DF4xlVMF-BfR8bXMIjhLq3-cXbKDO1w.woff" // Roboto Mono
            color="#FF4D4D"
            anchorX="left"
            anchorY="middle"
            fillOpacity={opacity}
        >
            {text}
        </Text>
    );
};

function StreamContent() {
    const groupRef = useRef<THREE.Group>(null);
    // Fixed set of lines that we cycle or scroll
    // Actually, to simulate an infinite stream, we can just scroll a long list and loop it.

    // Create a dense array of data
    const count = 40;
    const lines = useMemo(() => Array.from({ length: count }, () => generateDataLine()), []);

    useFrame((state: any) => {
        if (!groupRef.current) return;

        const time = state.clock.getElapsedTime();
        const speed = 0.5;

        // Scroll the group up
        // Actually, let's just animate the individual lines or the whole group
        // If we move the group, we need to reset.

        groupRef.current.children.forEach((child, i) => {
            // Base Y position
            let y = (i * 0.25) - (time * speed) % (count * 0.25);

            // Loop functionality
            // If y goes below a threshold, move it to top?
            // Easier: just let `mod` handle the cycling relative to index.
            // y = ((i * spacing + time * speed) % totalHeight) - offset

            const spacing = 0.25;
            const totalHeight = count * spacing;
            const scrollOffset = state.clock.getElapsedTime() * speed;

            let distinctY = ((i * spacing) - scrollOffset) % totalHeight;
            if (distinctY < -5) distinctY += totalHeight; // Wrap around

            // Apply "Warp" effect
            // Curve Z based on Y
            // e.g. parabola or sine wave
            const curveStrength = 0.5;
            // distinctY ranges roughly from -5 to +5 viewport height
            // We want the center to be closer, edges further away? or vise versa.
            // "Pulled into a 3D curve"
            const z = Math.pow(distinctY * 0.2, 2) * -1.0; // Parabolic curve away from camera

            // We also want to rotate slightly to follow the curve
            const rotX = distinctY * 0.1;

            child.position.set(-2, distinctY, z);
            child.rotation.x = -rotX;

            // Generic fade at edges
            const dist = Math.abs(distinctY);
            const opacity = 1.0 - THREE.MathUtils.smoothstep(dist, 2.0, 5.0);
            (child as any).fillOpacity = opacity; // Update opacity prop if possible, or material opacity
            if ((child as any).material) {
                ((child as any).material as THREE.MeshBasicMaterial).opacity = opacity;
                ((child as any).material as THREE.MeshBasicMaterial).transparent = true;
            }
        });
    });

    return (
        <group ref={groupRef}>
            {lines.map((text, i) => (
                <DataLine key={i} position={[0, i * 0.25, 0]} text={text} opacity={1} />
            ))}
        </group>
    );
}

export default function DataStream() {
    return (
        <div className="w-full h-full bg-pragma-dark overflow-hidden relative">
            {/* Gradient Overlays for smooth fade in/out */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-pragma-dark to-transparent z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-pragma-dark to-transparent z-10 pointer-events-none" />

            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
                <ambientLight />
                <StreamContent />
            </Canvas>
        </div>
    );
}
