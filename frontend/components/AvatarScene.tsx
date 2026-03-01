"use client";

import { useRef, useEffect, useState, Suspense, Component } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useFBX, useAnimations, Environment, ContactShadows, OrbitControls, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Group } from "three";
import type { AudioBands } from "./useRemoteAudioLevel";

const AVATAR_PATH = "/avatars/avatar.glb";
const ENVIRONMENT_PATH = "/environments/silent_hill-library.glb";
const SITTING_ANIM_PATH = "/animations/sitting.fbx";
const ENGINE_PATH = "/environments/analytical_engine.glb";

useGLTF.preload(ENVIRONMENT_PATH);
useGLTF.preload(ENGINE_PATH);

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

interface AvatarProps {
  volume: number;
  bandsRef?: React.RefObject<AudioBands>;
  children?: React.ReactNode;
}

class GLBErrorBoundary extends Component<AvatarProps, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <FallbackAvatar />;
    return this.props.children;
  }
}

// ─── Frequency-driven lip sync ───────────────────────────────────────────
const MORPH_LIST = [
  "jawOpen", "mouthOpen", "mouthClose",
  "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthUpperUpLeft", "mouthUpperUpRight",
  "mouthStretchLeft", "mouthStretchRight",
  "mouthSmileLeft", "mouthSmileRight",
  "mouthDimpleLeft", "mouthDimpleRight",
  "mouthPucker", "mouthFunnel",
  "mouthPressLeft", "mouthPressRight",
  "mouthShrugLower", "mouthShrugUpper",
  "mouthRollLower", "mouthRollUpper",
  "cheekSquintLeft", "cheekSquintRight", "cheekPuff",
  "noseSneerLeft", "noseSneerRight",
  "tongueOut", "jawForward",
  "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
  "viseme_PP", "viseme_FF", "viseme_TH", "viseme_SS",
  "viseme_DD", "viseme_RR", "viseme_nn",
  "viseme_sil", "viseme_CH", "viseme_kk",
];

// ─── Avatar Model ───────────────────────────────────────────────────────

function AvatarModel({ bandsRef }: AvatarProps) {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(AVATAR_PATH);
  const sceneRef = useRef(gltf.scene);
  const scene = sceneRef.current;

  // Load the sitting animation from FBX
  const sittingFbx = useFBX(SITTING_ANIM_PATH);
  const sittingClips = sittingFbx.animations;

  // Rename the sitting clip so it doesn't clash with existing clips
  if (sittingClips.length > 0) {
    sittingClips[0].name = "Sitting";
  }

  // Merge sitting animation with any existing avatar animations
  const allClips = [...(gltf.animations ?? []), ...sittingClips];
  const { actions } = useAnimations(allClips, scene);

  const smoothVol = useRef(0);
  const smoothF1 = useRef(0);
  const smoothF2 = useRef(0);
  const smoothSib = useRef(0);
  const smoothFric = useRef(0);
  const currentWeights = useRef<Record<string, number>>({});

  useEffect(() => {
    // Debug: confirm avatar loaded
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    console.info("[Avatar] loaded! bounding box size:", size);
    console.info("[Avatar] available animations:", Object.keys(actions ?? {}));

    // Play the sitting animation
    if (actions?.["Sitting"]) {
      actions["Sitting"].reset().fadeIn(0.3).setLoop(THREE.LoopRepeat, Infinity).play();
      console.info("[Avatar] Sitting animation playing");
    } else {
      // Fallback: play any available animations
      if (actions && Object.keys(actions).length > 0) {
        Object.keys(actions).forEach((name) => {
          const action = actions[name];
          if (action) action.reset().fadeIn(0.3).setLoop(THREE.LoopRepeat, Infinity).play();
        });
      }
    }
  }, [actions]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const bands = bandsRef?.current ?? { volume: 0, f1: 0, f2: 0, sibilant: 0, fricative: 0, prevVolume: 0 };
    const cw = currentWeights.current;

    const rawVol = bands.volume;
    const fastAtk = 28 * dt;
    const medAtk = 22 * dt;
    const fastRel = 14 * dt;
    const medRel = 9 * dt;

    smoothVol.current += (rawVol - smoothVol.current) * (rawVol > smoothVol.current ? fastAtk : fastRel);
    smoothF1.current += (bands.f1 - smoothF1.current) * (bands.f1 > smoothF1.current ? fastAtk : fastRel);
    smoothF2.current += (bands.f2 - smoothF2.current) * (bands.f2 > smoothF2.current ? medAtk : medRel);
    smoothSib.current += (bands.sibilant - smoothSib.current) * (bands.sibilant > smoothSib.current ? fastAtk : medRel);
    smoothFric.current += (bands.fricative - smoothFric.current) * (bands.fricative > smoothFric.current ? fastAtk : medRel);

    if (smoothVol.current < 0.002) smoothVol.current = 0;

    const vol = smoothVol.current;
    const f1 = smoothF1.current;
    const f2 = smoothF2.current;
    const sib = smoothSib.current;
    const fric = smoothFric.current;
    const speakGate = Math.min(1, Math.max(0, (vol - 0.008) * 5));

    const target: Record<string, number> = {};

    if (speakGate > 0) {
      const intensity = Math.min(1, vol * 2.2) * speakGate;

      const jaw = Math.min(1, f1 * 3.0) * intensity;
      target.jawOpen = jaw * 0.65;
      target.mouthOpen = jaw * 0.45;
      target.mouthLowerDownLeft = jaw * 0.28;
      target.mouthLowerDownRight = jaw * 0.28;
      target.mouthUpperUpLeft = jaw * 0.1;
      target.mouthUpperUpRight = jaw * 0.1;

      const spread = Math.min(1, f2 * 3.0) * intensity;
      target.mouthStretchLeft = spread * 0.32;
      target.mouthStretchRight = spread * 0.32;
      target.mouthSmileLeft = spread * 0.12;
      target.mouthSmileRight = spread * 0.12;
      target.mouthDimpleLeft = spread * 0.06;
      target.mouthDimpleRight = spread * 0.06;

      const round = Math.max(0, 1 - f2 * 3) * Math.min(1, f1 * 2.5) * intensity;
      target.mouthPucker = round * 0.45;
      target.mouthFunnel = round * 0.3;

      const sibAmt = Math.min(1, sib * 3.5) * intensity;
      target.mouthClose = sibAmt * 0.22;
      target.mouthShrugLower = sibAmt * 0.1;

      const fricAmt = Math.min(1, fric * 3.5) * intensity;
      target.mouthRollLower = fricAmt * 0.28;

      target.cheekSquintLeft = jaw * 0.04;
      target.cheekSquintRight = jaw * 0.04;

      const vAA = Math.max(0, f1 - 0.15) * Math.max(0, 1 - f2 * 3.5) * intensity;
      const vI  = Math.max(0, f2 - 0.15) * Math.max(0, 1 - f1 * 3.5) * intensity;
      const vE  = Math.min(Math.max(0, f2 - 0.08), Math.max(0, f1 - 0.08)) * intensity;
      const vO  = Math.max(0, f1 - 0.08) * Math.max(0, 1 - f2 * 4) * round;
      const vU  = round * Math.max(0, 1 - jaw * 2.5);

      target.viseme_aa = vAA * 0.65;
      target.viseme_I  = vI  * 0.55;
      target.viseme_E  = vE  * 0.45;
      target.viseme_O  = vO  * 0.55;
      target.viseme_U  = vU  * 0.45;
      target.viseme_SS = sibAmt * 0.45;
      target.viseme_FF = fricAmt * 0.45;

      if (f1 < 0.07 && f2 < 0.07 && sib < 0.05 && fric < 0.05 && vol > 0.02) {
        const closedAmt = intensity * 0.7;
        target.viseme_nn = closedAmt * 0.35;
        target.viseme_PP = closedAmt * 0.25;
        target.mouthPressLeft = closedAmt * 0.18;
        target.mouthPressRight = closedAmt * 0.18;
        target.jawOpen = Math.min(target.jawOpen, 0.04);
        target.mouthOpen = Math.min(target.mouthOpen, 0.02);
      }
    }

    for (const name of MORPH_LIST) {
      const tv = target[name] || 0;
      const cur = cw[name] || 0;
      const isJaw = name.includes("jaw") || name === "mouthOpen" || name.includes("LowerDown");
      const atkSpd = isJaw ? 24 : 18;
      const relSpd = isJaw ? 12 : 9;
      const speed = tv > cur ? atkSpd : relSpd;
      cw[name] = cur + (tv - cur) * speed * dt;
      if (cw[name] < 0.0003) cw[name] = 0;
    }

    scene.traverse((obj: any) => {
      if (!obj.isMesh || !obj.morphTargetInfluences || !obj.morphTargetDictionary) return;
      const dict = obj.morphTargetDictionary as Record<string, number>;
      const influences = obj.morphTargetInfluences as number[];
      for (const name of MORPH_LIST) {
        const i = dict[name];
        if (typeof i === "number") {
          influences[i] = cw[name] || 0;
        }
      }
    });
  });

  return (
    <group ref={groupRef} scale={2.2} position={[-1.8, -1, -3]}>
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

// ─── GLB Environment (silent_hill-library) ────────────────────────────

function EnvironmentModel() {
  const { scene } = useGLTF(ENVIRONMENT_PATH);
  const groupRef = useRef<Group>(null);
  const ready = useRef(false);
  const [transform, setTransform] = useState<{
    scale: number;
    offset: [number, number, number];
  } | null>(null);

  useEffect(() => {
    if (!scene || ready.current) return;
    ready.current = true;

    // Enable shadows and fix materials
    scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => {
          if (mat && "depthWrite" in mat) {
            (mat as THREE.Material).depthWrite = true;
          }
        });
      }
    });

    // Compute bounding box and auto-fit so the room fills the view
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Scale the environment so the longest axis = 12 units (room-sized)
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const targetSize = 12;
    const s = targetSize / maxDim;

    // Offset so the center of the model goes to origin, then shift down
    // so the floor aligns with y=-1.2 (avatar feet level)
    const floorY = box.min.y * s;
    setTransform({
      scale: s,
      offset: [-center.x * s, -floorY - 1.2, -center.z * s],
    });

    console.info("[Env] raw size:", size, "scale:", s, "floorY:", floorY);

    // Debug: log every mesh's world-space bounding box
    scene.updateMatrixWorld(true);
    let meshIdx = 0;
    scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        const mbox = new THREE.Box3().setFromObject(m);
        const msize = new THREE.Vector3();
        const mcenter = new THREE.Vector3();
        mbox.getSize(msize);
        mbox.getCenter(mcenter);
        // Transform to final world space
        const wCenter = [
          mcenter.x * s + (-center.x * s),
          mcenter.y * s + (-floorY - 1.2),
          mcenter.z * s + (-center.z * s),
        ];
        const wSize = [msize.x * s, msize.y * s, msize.z * s];
        console.info(
          `[Mesh ${meshIdx}] "${m.name}" center=[${wCenter.map((v) => v.toFixed(2))}] size=[${wSize.map((v) => v.toFixed(2))}]`
        );
        meshIdx++;
      }
    });
  }, [scene]);

  if (!scene || !transform) return null;

  return (
    <group
      ref={groupRef}
      scale={transform.scale}
      position={transform.offset}
    >
      <primitive object={scene} />
    </group>
  );
}

// ─── Babbage's Analytical Engine (desk prop) ──────────────────────────

function AnalyticalEngine() {
  const { scene } = useGLTF(ENGINE_PATH);
  const groupRef = useRef<Group>(null);
  const ready = useRef(false);
  const [engineScale, setEngineScale] = useState<number | null>(null);
  const [engineCenter, setEngineCenter] = useState<THREE.Vector3 | null>(null);

  useEffect(() => {
    if (!scene || ready.current) return;
    ready.current = true;

    scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });

    // Auto-scale and center the model
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    // Scale so the engine is about 1 unit tall (visible on desk)
    const s = 1.0 / maxDim;
    console.info("[Engine] raw size:", size, "center:", center, "scale:", s);
    setEngineScale(s);
    setEngineCenter(center);
  }, [scene]);

  if (!scene || engineScale === null || !engineCenter) return null;

  // Place on the desk surface — offset so the model's center sits at the target position
  return (
    <group
      ref={groupRef}
      position={[-0.8, 1.15, -1.5]}
      scale={engineScale}
    >
      <primitive object={scene} position={[-engineCenter.x, -engineCenter.y, -engineCenter.z]} />
    </group>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────

export function AvatarScene({
  volume,
  bandsRef,
  useFallback = false,
}: {
  volume: number;
  bandsRef?: React.RefObject<AudioBands>;
  useFallback?: boolean;
}) {
  const avatarAvailable = useAvatarAvailable();
  const showGlb = !useFallback && avatarAvailable === true;

  return (
    <div className="canvas-wrap" style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows
        camera={{ position: [0, 1.5, 5], fov: 50 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.3,
        }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x2a2420, 1);
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
          const canvas = gl.domElement;
          canvas.addEventListener("webglcontextlost", (e: Event) => {
            e.preventDefault();
            console.warn("WebGL context lost.");
          });
          canvas.addEventListener("webglcontextrestored", () => {
            console.info("WebGL context restored.");
          });
        }}
      >
        {/* ─── Lighting ─── */}
        <ambientLight intensity={0.7} color="#E8DCC8" />

        {/* Key light from upper-left */}
        <directionalLight
          position={[-3, 4, 2]}
          intensity={1.4}
          color="#F5ECD8"
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={15}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-bias={-0.0003}
        />

        {/* Fill light */}
        <directionalLight position={[2, 3, 1]} intensity={0.4} color="#E8DCC0" />

        {/* Warm overhead */}
        <pointLight position={[0, 3, -1]} intensity={0.5} color="#E8D8C0" decay={2} distance={12} />

        {/* Warm bounce from below */}
        <pointLight position={[0, -0.5, 0]} intensity={0.15} color="#A08060" decay={2} distance={5} />

        {/* Camera controls — inside the library looking at avatar */}
        <OrbitControls
          target={[-1, 0.5, -1.9]}
          enableDamping
          dampingFactor={0.12}
          minDistance={1.5}
          maxDistance={8}
          minPolarAngle={Math.PI * 0.15}
          maxPolarAngle={Math.PI * 0.6}
          minAzimuthAngle={-Math.PI * 0.6}
          maxAzimuthAngle={Math.PI * 0.6}
          enablePan
          panSpeed={0.5}
          rotateSpeed={0.6}
          zoomSpeed={0.8}
        />

        {/* IBL reflections */}
        <Environment preset="apartment" />

        {/* GLB Library Environment */}
        <Suspense fallback={null}>
          <EnvironmentModel />
        </Suspense>

        {/* Babbage's Analytical Engine on the desk */}
        <Suspense fallback={null}>
          <AnalyticalEngine />
        </Suspense>

        {/* Avatar */}
        <Suspense fallback={<FallbackAvatar />}>
          {showGlb ? (
            <GLBErrorBoundary volume={volume} bandsRef={bandsRef}>
              <AvatarModel volume={volume} bandsRef={bandsRef} />
            </GLBErrorBoundary>
          ) : (
            <FallbackAvatar />
          )}
        </Suspense>

        {/* Dust motes */}
        <Sparkles
          count={50}
          scale={[6, 4, 6]}
          size={1}
          speed={0.1}
          opacity={0.07}
          color="#E8D8C0"
          position={[0, 1, 0]}
        />

        {/* Contact shadow under avatar */}
        <ContactShadows
          position={[-1, -1.19, -1.9]}
          opacity={0.5}
          scale={10}
          blur={2.5}
          far={4}
        />

        {/* Post-processing */}
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.55}
            luminanceSmoothing={0.9}
            intensity={0.2}
            mipmapBlur
          />
          <Vignette offset={0.3} darkness={0.45} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
