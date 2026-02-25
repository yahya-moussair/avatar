"use client";

import { useRef, useEffect, useState, Suspense, Component } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";

const AVATAR_PATH = "/avatars/avtarr.glb";

/** Check if the avatar GLB exists so we don't trigger a 404 from the loader. */
function useAvatarAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(AVATAR_PATH, { method: "HEAD" })
      .then((r) => !cancelled && setAvailable(r.ok))
      .catch(() => !cancelled && setAvailable(false));
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}

class GLBErrorBoundary extends Component<{ volume: number; children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <FallbackAvatar />;
    return this.props.children;
  }
}

function AvatarModel({ volume }: { volume: number }) {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(AVATAR_PATH);
  const sceneRef = useRef(gltf.scene);
  const scene = sceneRef.current;
  const [morphNames, setMorphNames] = useState<string[]>([]);

  useEffect(() => {
    scene.traverse((obj: any) => {
      if (obj.isMesh && obj.morphTargetInfluences) {
        const names: string[] = [];
        if (obj.morphTargetDictionary) {
          Object.keys(obj.morphTargetDictionary).forEach((name) => names.push(name));
        }
        if (names.length) setMorphNames((prev) => (prev.length ? prev : names));
      }
    });
  }, [scene]);

  useEffect(() => {
    if (volume === 0 || !morphNames.length) return;
    scene.traverse((obj: any) => {
      if (!obj.isMesh || !obj.morphTargetInfluences || !obj.morphTargetDictionary) return;
      const dict = obj.morphTargetDictionary as Record<string, number>;
      const influences = obj.morphTargetInfluences as number[];
      const mouthLike = morphNames.filter(
        (n) =>
          /mouth|jaw|open|aa|ee|oh|ou|viseme|speak|lip/i.test(n) && !/close|smile|eye/i.test(n)
      );
      if (mouthLike.length) {
        mouthLike.forEach((name) => {
          const idx = dict[name];
          if (typeof idx === "number") influences[idx] = Math.min(1, volume * 1.2);
        });
      } else {
        const firstIdx = 0;
        if (influences[firstIdx] !== undefined) influences[firstIdx] = Math.min(1, volume * 1.2);
      }
    });
  }, [volume, scene, morphNames]);

  return (
    <group ref={groupRef} scale={1} position={[0, -1.2, 0]}>
      <primitive object={scene} />
    </group>
  );
}

function FallbackAvatar() {
  return (
    <mesh position={[0, -0.5, 0]}>
      <sphereGeometry args={[0.5, 32, 32]} />
      <meshStandardMaterial color="#6366f1" />
    </mesh>
  );
}

export function AvatarScene({ volume, useFallback = false }: { volume: number; useFallback?: boolean }) {
  const avatarAvailable = useAvatarAvailable();
  const showGlb = !useFallback && avatarAvailable === true;

  return (
    <div className="canvas-wrap" style={{ position: "absolute", inset: 0 }}>
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x0f0f12, 0);
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e: Event) => {
            e.preventDefault();
            console.warn("WebGL context lost. Refresh the page if the avatar stops updating.");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            console.info("WebGL context restored.");
          });
        }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 4, 5]} intensity={1.2} />
        <directionalLight position={[-2, 2, 3]} intensity={0.4} />
        <pointLight position={[0, 2, 2]} intensity={0.5} />
        <Suspense fallback={<FallbackAvatar />}>
          {showGlb ? (
            <GLBErrorBoundary volume={volume}>
              <AvatarModel volume={volume} />
            </GLBErrorBoundary>
          ) : (
            <FallbackAvatar />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
