"use client";

import { useRef, useEffect, useState, Suspense, Component } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import type { Group } from "three";
import type { AudioBands } from "./useRemoteAudioLevel";

const AVATAR_PATH = "/avatars/avatar.glb";

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

// ─── Full-face speech shapes ─────────────────────────────────────────────
// Each shape is a complete facial pose: viseme + jaw + lips + tongue + cheeks.
// During speech we step through these in a natural order, like real animation.

type MorphMap = Record<string, number>;

// The shapes cycle in this order, imitating a natural consonant-vowel pattern:
// close → open → spread → round → close → open → ...
const SPEECH_SHAPES: MorphMap[] = [
  // 0: AA — wide open "ah"
  {
    viseme_aa: 0.9,
    jawOpen: 0.48,
    mouthOpen: 0.38,
    mouthLowerDownLeft: 0.22,
    mouthLowerDownRight: 0.22,
    mouthUpperUpLeft: 0.12,
    mouthUpperUpRight: 0.12,
    cheekSquintLeft: 0.05,
    cheekSquintRight: 0.05,
  },
  // 1: PP — lips pressed (consonant)
  {
    viseme_PP: 0.85,
    mouthClose: 0.45,
    mouthPressLeft: 0.4,
    mouthPressRight: 0.4,
    jawOpen: 0.02,
    cheekPuff: 0.12,
    mouthShrugLower: 0.08,
  },
  // 2: E — spread "eh"
  {
    viseme_E: 0.9,
    jawOpen: 0.3,
    mouthOpen: 0.22,
    mouthStretchLeft: 0.3,
    mouthStretchRight: 0.3,
    mouthSmileLeft: 0.12,
    mouthSmileRight: 0.12,
    mouthLowerDownLeft: 0.14,
    mouthLowerDownRight: 0.14,
    mouthDimpleLeft: 0.06,
    mouthDimpleRight: 0.06,
  },
  // 3: O — rounded "oh"
  {
    viseme_O: 0.9,
    mouthPucker: 0.4,
    mouthFunnel: 0.3,
    jawOpen: 0.28,
    mouthOpen: 0.2,
    mouthLowerDownLeft: 0.1,
    mouthLowerDownRight: 0.1,
    mouthShrugLower: 0.06,
  },
  // 4: FF — lower lip to teeth
  {
    viseme_FF: 0.85,
    mouthRollLower: 0.35,
    mouthLowerDownLeft: 0.12,
    mouthLowerDownRight: 0.12,
    mouthUpperUpLeft: 0.1,
    mouthUpperUpRight: 0.1,
    jawOpen: 0.06,
  },
  // 5: AA again (variation — slightly different)
  {
    viseme_aa: 0.8,
    jawOpen: 0.42,
    mouthOpen: 0.32,
    mouthLowerDownLeft: 0.2,
    mouthLowerDownRight: 0.2,
    mouthStretchLeft: 0.06,
    mouthStretchRight: 0.06,
  },
  // 6: TH — tongue out
  {
    viseme_TH: 0.85,
    tongueOut: 0.4,
    jawOpen: 0.12,
    mouthOpen: 0.18,
    mouthLowerDownLeft: 0.08,
    mouthLowerDownRight: 0.08,
    mouthUpperUpLeft: 0.06,
    mouthUpperUpRight: 0.06,
  },
  // 7: I — spread wide "ee"
  {
    viseme_I: 0.9,
    jawOpen: 0.12,
    mouthStretchLeft: 0.38,
    mouthStretchRight: 0.38,
    mouthSmileLeft: 0.16,
    mouthSmileRight: 0.16,
    mouthDimpleLeft: 0.08,
    mouthDimpleRight: 0.08,
    cheekSquintLeft: 0.07,
    cheekSquintRight: 0.07,
  },
  // 8: U — tight pucker "oo"
  {
    viseme_U: 0.9,
    mouthPucker: 0.6,
    mouthFunnel: 0.4,
    jawOpen: 0.1,
    mouthShrugLower: 0.12,
    mouthRollLower: 0.06,
    mouthRollUpper: 0.06,
  },
  // 9: NN — nasal, mouth closed, nostrils
  {
    viseme_nn: 0.8,
    jawOpen: 0.04,
    mouthClose: 0.3,
    mouthShrugLower: 0.15,
    mouthShrugUpper: 0.08,
    noseSneerLeft: 0.1,
    noseSneerRight: 0.1,
    mouthPressLeft: 0.08,
    mouthPressRight: 0.08,
  },
  // 10: SS — sibilant hiss
  {
    viseme_SS: 0.85,
    jawOpen: 0.06,
    mouthClose: 0.18,
    mouthStretchLeft: 0.16,
    mouthStretchRight: 0.16,
    mouthShrugLower: 0.1,
    mouthUpperUpLeft: 0.04,
    mouthUpperUpRight: 0.04,
  },
  // 11: DD — tongue tap
  {
    viseme_DD: 0.7,
    jawOpen: 0.2,
    mouthOpen: 0.16,
    tongueOut: 0.22,
    jawForward: 0.05,
    mouthLowerDownLeft: 0.08,
    mouthLowerDownRight: 0.08,
  },
  // 12: RR — rhotic
  {
    viseme_RR: 0.85,
    jawOpen: 0.16,
    mouthOpen: 0.1,
    mouthPucker: 0.2,
    mouthFunnel: 0.15,
    mouthShrugUpper: 0.1,
  },
];

// Natural-feeling order to step through shapes.
// Alternates consonants and vowels like real speech.
const SHAPE_SEQUENCE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 10, 7, 3, 11, 2, 12, 8, 1, 5];

// Collect all morph names
const ALL_MORPH_NAMES = new Set<string>();
SPEECH_SHAPES.forEach((s) => Object.keys(s).forEach((k) => ALL_MORPH_NAMES.add(k)));
["viseme_sil", "viseme_CH", "viseme_kk"].forEach((n) => ALL_MORPH_NAMES.add(n));
const MORPH_LIST = Array.from(ALL_MORPH_NAMES);

// ─── Avatar Model ───────────────────────────────────────────────────────

function AvatarModel({ bandsRef }: AvatarProps) {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(AVATAR_PATH);
  const sceneRef = useRef(gltf.scene);
  const scene = sceneRef.current;
  const { actions } = useAnimations(gltf.animations ?? [], scene);

  // Animation state
  const smoothVol = useRef(0);
  const currentWeights = useRef<Record<string, number>>({});
  const seqIndex = useRef(0);        // current position in SHAPE_SEQUENCE
  const shapeTimer = useRef(0);      // time since last shape change
  const wasSpeaking = useRef(false);  // to detect speech onset
  const currentShape = useRef<MorphMap>({}); // current target shape (blended for transition)
  const prevShape = useRef<MorphMap>({});    // previous shape (for crossfade)
  const crossfade = useRef(1);              // 0 = all prevShape, 1 = all currentShape

  useEffect(() => {
    if (!actions || Object.keys(actions).length === 0) return;
    Object.keys(actions).forEach((name) => {
      const action = actions[name];
      if (action) action.reset().fadeIn(0.3).setLoop(2201, Infinity).play();
    });
  }, [actions]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const bands = bandsRef?.current ?? { volume: 0, f1: 0, f2: 0, sibilant: 0, fricative: 0, prevVolume: 0 };
    const cw = currentWeights.current;

    // ── Volume envelope: fast attack, gentle release ──
    const rawVol = bands.volume;
    if (rawVol > smoothVol.current) {
      smoothVol.current += (rawVol - smoothVol.current) * 25 * dt;
    } else {
      smoothVol.current += (rawVol - smoothVol.current) * 6 * dt;
    }
    if (smoothVol.current < 0.005) smoothVol.current = 0;
    const vol = smoothVol.current;
    const speaking = vol > 0.03;

    // ── Shape sequencing: step to next shape on a timer ──
    // Shape duration varies with volume (louder → faster, like emphatic speech)
    const shapeDuration = speaking ? 0.1 + (1 - vol) * 0.08 : 0.3;

    shapeTimer.current += dt;

    if (speaking) {
      // On speech onset, immediately pick a shape
      if (!wasSpeaking.current) {
        wasSpeaking.current = true;
        shapeTimer.current = shapeDuration; // force immediate shape pick
      }

      // Step to next shape when timer expires
      if (shapeTimer.current >= shapeDuration) {
        shapeTimer.current = 0;
        prevShape.current = { ...currentShape.current };
        crossfade.current = 0;

        seqIndex.current = (seqIndex.current + 1) % SHAPE_SEQUENCE.length;
        const shapeIdx = SHAPE_SEQUENCE[seqIndex.current];
        currentShape.current = { ...SPEECH_SHAPES[shapeIdx] };
      }

      // Advance crossfade (how far into the transition to new shape)
      crossfade.current = Math.min(1, crossfade.current + dt * 10);
    } else {
      wasSpeaking.current = false;
    }

    // ── Compute blended target from crossfade ──
    const t = crossfade.current * crossfade.current * (3 - 2 * crossfade.current); // ease in-out
    const intensity = speaking ? Math.min(1, vol * 2.2) : 0;

    for (const name of MORPH_LIST) {
      const a = prevShape.current[name] || 0;
      const b = currentShape.current[name] || 0;
      const blended = (a * (1 - t) + b * t) * intensity;

      const cur = cw[name] || 0;
      // Asymmetric smoothing on top of crossfade
      const speed = blended > cur ? 20 : 8;
      cw[name] = cur + (blended - cur) * speed * dt;
      if (cw[name] < 0.001) cw[name] = 0;
    }

    // ── Apply to every mesh (Head, Teeth, Tongue, etc.) ──
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
            <GLBErrorBoundary volume={volume} bandsRef={bandsRef}>
              <AvatarModel volume={volume} bandsRef={bandsRef} />
            </GLBErrorBoundary>
          ) : (
            <FallbackAvatar />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}
