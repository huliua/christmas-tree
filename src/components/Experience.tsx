
import React, { useContext } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, OrbitControls, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import TreeSystem from './TreeSystem';
import CrystalOrnaments from './CrystalOrnaments';
import { TreeContext, TreeContextType } from '../types';

const Rig = () => {
  const { state, zoomOffset } = useContext(TreeContext) as TreeContextType;
  useFrame((state3d) => {
    // Gentle floating camera movement
    const t = state3d.clock.getElapsedTime();
    // Move camera out when Chaos, in when Formed
    // Apply zoomOffset (clamped to avoid clipping)
    const baseZ = state === 'CHAOS' ? 22 : 16;
    const targetZ = Math.max(5, Math.min(baseZ + zoomOffset, 50));
    const targetY = state === 'CHAOS' ? 2 : 0;

    state3d.camera.position.z = THREE.MathUtils.lerp(state3d.camera.position.z, targetZ + Math.sin(t * 0.2) * 2, 0.02);
    state3d.camera.position.y = THREE.MathUtils.lerp(state3d.camera.position.y, targetY + Math.cos(t * 0.2) * 1, 0.02);
    state3d.camera.lookAt(0, 0, 0);
  });
  return null;
};

const Experience: React.FC = () => {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [0, 0, 18], fov: 45, near: 0.1, far: 100 }}
      gl={{
        antialias: false,
        alpha: true, // 启用透明度
        toneMapping: THREE.ReinhardToneMapping,
        toneMappingExposure: 1.5,
        stencil: false,
        depth: true
      }}
    >
      {/* 移除背景色，让摄像头背景可见 */}

      {/* Cinematic Lighting */}
      <ambientLight intensity={0.4} color="#001133" />
      <spotLight
        position={[10, 20, 10]}
        angle={0.5}
        penumbra={1}
        intensity={8}
        color="#fff0dd"
        castShadow
      />
      <pointLight position={[-10, -5, -10]} intensity={3} color="#004225" />
      <pointLight position={[0, 0, 0]} intensity={1} color="#ffaa00" distance={10} />

      {/* Environment */}
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />

      {/* 多层次闪光星星 - 模拟真实夜空中部分星星闪烁 */}
      {/* 慢速闪烁的金色星星 */}
      <Sparkles count={500} scale={35} size={5} speed={0.3} opacity={0.8} color="#ffd700" />
      <Sparkles count={300} scale={40} size={4} speed={0.2} opacity={0.6} color="#ffffcc" />

      {/* 中速闪烁的白色/银色星星 */}
      <Sparkles count={400} scale={30} size={3.5} speed={0.5} opacity={0.7} color="#ffffff" />
      <Sparkles count={200} scale={35} size={3} speed={0.4} opacity={0.5} color="#e6e6fa" />

      {/* 快速闪烁的彩色点缀 */}
      <Sparkles count={150} scale={25} size={3} speed={0.8} opacity={0.6} color="#ff6b6b" />
      <Sparkles count={150} scale={25} size={3} speed={0.75} opacity={0.6} color="#4ecdc4" />

      <Environment preset="city" environmentIntensity={0.5} />

      {/* Main Content */}
      <group position={[0, -2, 0]}>
        <TreeSystem />
        <CrystalOrnaments />
      </group>

      {/* Controls & Rig */}
      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={8}
        maxDistance={40}
        maxPolarAngle={Math.PI / 1.6}
        target={[0, 2, 0]}
      />
      <Rig />

      {/* Post Processing - Optimized for Clarity (No DoF) */}
      <EffectComposer enableNormalPass={false}>
        <Bloom
          luminanceThreshold={0.8} // Lower threshold to make more things glow
          mipmapBlur
          intensity={1.2} // Increased intensity
          radius={0.5}
          levels={8}
        />
        <Noise opacity={0.03} />
        <Vignette eskil={false} offset={0.1} darkness={0.8} />
      </EffectComposer>
    </Canvas>
  );
};

export default Experience;
