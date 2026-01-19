import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Gltf, OrbitControls, Environment } from '@react-three/drei';

interface ThreeSceneProps {
  modelUrl: string;
}

export default function ThreeScene({ modelUrl }: ThreeSceneProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 2, 5], fov: 50 }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} />
        
        <Suspense fallback={null}>
          <Gltf src={modelUrl} />
          <Environment preset="city" />
        </Suspense>

        <OrbitControls autoRotate />
      </Canvas>
    </div>
  );
}
