"use client";

import { useRef, useEffect, useState, useMemo, Suspense, Component } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useFBX, useAnimations, Environment, ContactShadows, OrbitControls, Sparkles } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Group } from "three";
import type { AudioBands } from "./useRemoteAudioLevel";
import type { LipSyncState } from "./useLipSync";

const AVATAR_PATH = "/avatars/avtarr.glb";
const ENVIRONMENT_PATH = "/environments/silent_hill-library.glb";
const SITTING_ANIM_PATH = "/animations/sitting.fbx";
const ENGINE_PATH = "/environments/analytical_engine.glb";
const BRASS_MACHINE_PATH = "/environments/brass_machine.glb";
const LOOM_PATH = "/environments/mechanical_loom.glb";
const ADA_CADRE_PATH = "/environments/ada_cadre.glb";

/** Chair behind the desk (deeper −Z than the desktop). Tune if you change env/avatar. */
const AVATAR_WORLD = {
  position: [-1.9, -1.8, -3.2] as [number, number, number],
  rotation: [0, 0.42, 0] as [number, number, number],
  scale: 2.15,
};
const AVATAR_SHADOW_FLOOR_Y = -1.19;

useGLTF.preload(ENVIRONMENT_PATH);
useGLTF.preload(AVATAR_PATH);
useGLTF.preload(ENGINE_PATH);
useGLTF.preload(BRASS_MACHINE_PATH);
useGLTF.preload(LOOM_PATH);
useGLTF.preload(ADA_CADRE_PATH);

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
  lipSyncRef?: React.RefObject<LipSyncState>;
  consumeVisemes?: (bandsRef: React.RefObject<AudioBands> | undefined, delta: number) => void;
  isConnected?: boolean;
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

// ─── Frequency-driven lip sync + expression (brows, smile, etc.) ───────────
const MORPH_LIST = [
  "jawOpen", "mouthOpen", "mouthClose",
  "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthUpperUpLeft", "mouthUpperUpRight",
  "mouthStretchLeft", "mouthStretchRight",
  "mouthSmileLeft", "mouthSmileRight",
  "mouthDimpleLeft", "mouthDimpleRight",
  "mouthFrownLeft", "mouthFrownRight",
  "mouthPucker", "mouthFunnel",
  "mouthPressLeft", "mouthPressRight",
  "mouthShrugLower", "mouthShrugUpper",
  "mouthRollLower", "mouthRollUpper",
  "cheekSquintLeft", "cheekSquintRight", "cheekPuff",
  "noseSneerLeft", "noseSneerRight",
  "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight",
  "eyeBlinkLeft", "eyeBlinkRight", "eyesClosed",
  "tongueOut", "jawForward",
  "viseme_aa", "viseme_E", "viseme_I", "viseme_O", "viseme_U",
  "viseme_PP", "viseme_FF", "viseme_TH", "viseme_SS",
  "viseme_DD", "viseme_RR", "viseme_nn",
  "viseme_sil", "viseme_CH", "viseme_kk",
];

/** All bone names from skinned meshes under root (for FBX → GLB retargeting). */
function collectSkinnedBoneNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((obj) => {
    const m = obj as THREE.SkinnedMesh;
    if (m.isSkinnedMesh && m.skeleton?.bones) {
      for (const b of m.skeleton.bones) names.add(b.name);
    }
  });
  return names;
}

const normBoneKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function resolveBoneTrackName(
  nodeName: string,
  boneNames: Set<string>,
  canonicalByLower: Map<string, string>,
  fuzzyByNorm: Map<string, string>
): string | null {
  if (boneNames.has(nodeName)) return nodeName;
  const byLower = canonicalByLower.get(nodeName.toLowerCase());
  if (byLower) return byLower;

  const noMix = nodeName
    .replace(/^mixamorig:/i, "")
    .replace(/^mixamorig_/i, "")
    .replace(/^mixamorig/i, "");
  if (boneNames.has(noMix)) return noMix;
  const noMixL = canonicalByLower.get(noMix.toLowerCase());
  if (noMixL) return noMixL;

  const last = nodeName.split(/[:|]/).pop() ?? nodeName;
  if (boneNames.has(last)) return last;
  const lastL = canonicalByLower.get(last.toLowerCase());
  if (lastL) return lastL;

  const fuzzy = fuzzyByNorm.get(normBoneKey(nodeName));
  if (fuzzy) return fuzzy;

  return null;
}

function isRootRetargetBone(lbone: string): boolean {
  return (
    lbone === "hips" ||
    lbone === "mixamorighips" ||
    lbone === "pelvis" ||
    lbone === "root" ||
    lbone === "armature" ||
    lbone === "cc_base_bone001" ||
    lbone === "cc_base_bone"
  );
}

/**
 * Clone FBX clip and rename tracks to match this GLB's bone names so the mixer can apply it.
 * Strips root position (no slide) and root rotation (bad retarget often folds the torso through props).
 */
function retargetSittingClipFromFbx(
  sourceClip: THREE.AnimationClip,
  avatarRoot: THREE.Object3D
): THREE.AnimationClip {
  const clip = sourceClip.clone();
  clip.name = "Sitting";
  const boneNames = collectSkinnedBoneNames(avatarRoot);
  const canonicalByLower = new Map<string, string>();
  const fuzzyByNorm = new Map<string, string>();
  for (const n of Array.from(boneNames)) {
    canonicalByLower.set(n.toLowerCase(), n);
    const nk = normBoneKey(n);
    if (!fuzzyByNorm.has(nk)) fuzzyByNorm.set(nk, n);
  }

  const out: THREE.KeyframeTrack[] = [];
  for (const track of clip.tracks) {
    const dot = track.name.indexOf(".");
    if (dot === -1) continue;
    const nodePart = track.name.slice(0, dot);
    const propPart = track.name.slice(dot);
    const resolved = resolveBoneTrackName(
      nodePart,
      boneNames,
      canonicalByLower,
      fuzzyByNorm
    );
    if (!resolved) continue;
    track.name = resolved + propPart;
    out.push(track);
  }

  clip.tracks = out.filter((track) => {
    const [bone, ...rest] = track.name.split(".");
    const prop = rest.join(".");
    const lbone = bone.toLowerCase();
    if (!isRootRetargetBone(lbone)) return true;
    if (prop === "position") return false;
    if (prop === "quaternion") return false;
    if (prop === "rotation" || prop.startsWith("rotation[")) return false;
    return true;
  });

  clip.resetDuration();
  return clip;
}

// ─── Avatar Model ───────────────────────────────────────────────────────

function AvatarModel({ bandsRef, lipSyncRef, consumeVisemes, isConnected = false }: AvatarProps) {
  const groupRef = useRef<Group>(null);
  const gltf = useGLTF(AVATAR_PATH);
  const sceneRef = useRef(gltf.scene);
  const scene = sceneRef.current;

  const sittingFbx = useFBX(SITTING_ANIM_PATH);

  // Stable clip list: new [] every render was resetting drei's mixer → T-pose
  const sittingClip = useMemo(() => {
    if (!sittingFbx.animations.length) return null;
    try {
      const retargeted = retargetSittingClipFromFbx(sittingFbx.animations[0], scene);
      const matched = retargeted.tracks.length;
      console.info(
        "[Avatar] Sitting clip retargeted:",
        retargeted.name,
        "tracks:",
        matched,
        "bones on avatar:",
        collectSkinnedBoneNames(scene).size
      );
      if (matched === 0) {
        console.warn(
          "[Avatar] No animation tracks matched GLB bones — check FBX rig vs avatar GLB naming."
        );
      }
      return retargeted;
    } catch (e) {
      console.error("[Avatar] Failed to retarget sitting clip", e);
      return null;
    }
  }, [sittingFbx, scene]);

  const allClips = useMemo(() => {
    const fromGltf = [...(gltf.animations ?? [])];
    if (sittingClip) fromGltf.push(sittingClip);
    return fromGltf;
  }, [gltf.animations, sittingClip]);

  const { actions, mixer } = useAnimations(allClips, scene);

  // Head gesture: only when connected; once per 60s — look right → look down → back left → center
  const headBoneRef = useRef<THREE.Object3D | null>(null);
  const CYCLE_DURATION = 6;
  const COOLDOWN_SEC = 60;
  const lastCycleEndTimeRef = useRef(-60);
  const cyclePhaseTimeRef = useRef(0);
  const wobbleQuatRef = useRef(new THREE.Quaternion());
  const wobbleEulerRef = useRef(new THREE.Euler(0, 0, 0, "YXZ"));
  const totalTimeRef = useRef(0);

  useEffect(() => {
    if (!isConnected) {
      lastCycleEndTimeRef.current = -COOLDOWN_SEC;
      cyclePhaseTimeRef.current = 0;
    }
  }, [isConnected]);

  useEffect(() => {
    headBoneRef.current = null;
    scene.traverse((obj: THREE.Object3D) => {
      const o = obj as THREE.Bone;
      const isBone = o.isBone === true || (obj as any).type === "Bone";
      if (!isBone) return;
      if (obj.name.toLowerCase().includes("head")) {
        headBoneRef.current = obj;
      }
    });
  }, [scene]);

  const smoothVol = useRef(0);
  const smoothF1 = useRef(0);
  const smoothF2 = useRef(0);
  const smoothSib = useRef(0);
  const smoothFric = useRef(0);
  const currentWeights = useRef<Record<string, number>>({});

  // Blink: every ~2–5s, quick close/open (eyesClosed or eyeBlink L+R)
  const lifeTimeRef = useRef(0);
  const nextBlinkTimeRef = useRef(2.5);
  const blinkPhaseRef = useRef<0 | 1 | 2>(0);
  const blinkPhaseTimeRef = useRef(0);
  const BLINK_CLOSE_DUR = 0.06;
  const BLINK_OPEN_DUR = 0.08;

  // Occasional subtle smile: every ~8–15s, brief smile then fade
  const nextSmileTimeRef = useRef(9);
  const smilePhaseRef = useRef<0 | 1 | 2 | 3>(0);
  const smilePhaseTimeRef = useRef(0);
  const SMILE_FADE_IN = 0.25;
  const SMILE_HOLD = 0.8;
  const SMILE_FADE_OUT = 0.25;
  const SMILE_AMOUNT = 0.22;

  useEffect(() => {
    if (!actions || !mixer) return;

    mixer.stopAllAction();

    if (actions["Sitting"]) {
      const action = actions["Sitting"];
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.setEffectiveWeight(1);
      action.setEffectiveTimeScale(1);
      action.play();
      console.info("[Avatar] Sitting animation playing");
    }
  }, [actions, mixer]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const bands = bandsRef?.current ?? { volume: 0, f1: 0, f2: 0, sibilant: 0, fricative: 0, prevVolume: 0 };
    const cw = currentWeights.current;

    // ── Step 1: Advance the text-based lip sync system ──
    if (consumeVisemes) {
      consumeVisemes(bandsRef, delta);
    }
    const ls = lipSyncRef?.current;
    const textActive = ls?.active ?? false;

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

    const target: Record<string, number> = {};

    // ── Step 2: If text-based lip sync is active, use its morph weights ──
    if (textActive && ls) {
      const mw = ls.morphWeights;
      for (const name of MORPH_LIST) {
        target[name] = mw[name] ?? 0;
      }
    } else {
      // ── Fallback: gentle frequency-based lip sync ──
      // When we have no viseme data, drive a simple jaw + basic vowel shapes
      // so the mouth still moves, but keep it subtle.
      const vol = smoothVol.current;
      const f1 = smoothF1.current;
      const f2 = smoothF2.current;
      const speakGate = Math.min(1, Math.max(0, (vol - 0.01) * 4));

      if (speakGate > 0) {
        const intensity = Math.min(1, vol * 1.4) * speakGate;

        const jaw = Math.min(1, f1 * 2.0) * intensity;
        target.jawOpen = jaw * 0.26;
        target.mouthOpen = jaw * 0.18;
        target.mouthLowerDownLeft = jaw * 0.10;
        target.mouthLowerDownRight = jaw * 0.10;

        const spread = Math.min(1, f2 * 2.3) * intensity;
        target.mouthStretchLeft = spread * 0.28;
        target.mouthStretchRight = spread * 0.28;

        const round = Math.max(0, 1 - f2 * 2.8) * Math.min(1, f1 * 2.0) * intensity;
        target.mouthPucker = round * 0.32;
        target.mouthFunnel = round * 0.26;

        const vAA = Math.max(0, f1 - 0.12) * Math.max(0, 1 - f2 * 3.0) * intensity;
        const vI  = Math.max(0, f2 - 0.12) * Math.max(0, 1 - f1 * 3.0) * intensity;
        const vE  = Math.min(Math.max(0, f2 - 0.06), Math.max(0, f1 - 0.06)) * intensity;
        const vO  = Math.max(0, f1 - 0.06) * Math.max(0, 1 - f2 * 3.2) * round;
        const vU  = round * Math.max(0, 1 - jaw * 2.0);

        target.viseme_aa = vAA * 0.5;
        target.viseme_I  = vI  * 0.45;
        target.viseme_E  = vE  * 0.38;
        target.viseme_O  = vO  * 0.5;
        target.viseme_U  = vU  * 0.42;
      }
    }

    // ── Add text-driven expression (brows, smile, sad, surprise, thoughtful) on top of mouth ──
    const expr = ls?.expressionWeights ?? {};
    for (const [name, w] of Object.entries(expr)) {
      target[name] = (target[name] ?? 0) + w;
    }

    // ── Blink: every few seconds, quick close then open ──
    lifeTimeRef.current += dt;
    const lifeTime = lifeTimeRef.current;
    let blinkAmount = 0;
    if (blinkPhaseRef.current === 0) {
      if (lifeTime >= nextBlinkTimeRef.current) {
        blinkPhaseRef.current = 1;
        blinkPhaseTimeRef.current = 0;
      }
    } else if (blinkPhaseRef.current === 1) {
      blinkPhaseTimeRef.current += dt;
      const p = Math.min(1, blinkPhaseTimeRef.current / BLINK_CLOSE_DUR);
      blinkAmount = p;
      if (p >= 1) {
        blinkPhaseRef.current = 2;
        blinkPhaseTimeRef.current = 0;
      }
    } else {
      blinkPhaseTimeRef.current += dt;
      const p = Math.min(1, blinkPhaseTimeRef.current / BLINK_OPEN_DUR);
      blinkAmount = 1 - p;
      if (p >= 1) {
        blinkPhaseRef.current = 0;
        nextBlinkTimeRef.current = lifeTime + 2.2 + Math.random() * 2.8;
      }
    }
    if (blinkAmount > 0) {
      target.eyesClosed = (target.eyesClosed ?? 0) + blinkAmount;
      target.eyeBlinkLeft = (target.eyeBlinkLeft ?? 0) + blinkAmount;
      target.eyeBlinkRight = (target.eyeBlinkRight ?? 0) + blinkAmount;
    }

    // ── Occasional subtle smile: fade in, hold, fade out ──
    let smileAmount = 0;
    if (smilePhaseRef.current === 0) {
      if (lifeTime >= nextSmileTimeRef.current) {
        smilePhaseRef.current = 1;
        smilePhaseTimeRef.current = 0;
      }
    } else if (smilePhaseRef.current === 1) {
      smilePhaseTimeRef.current += dt;
      const p = Math.min(1, smilePhaseTimeRef.current / SMILE_FADE_IN);
      smileAmount = p * SMILE_AMOUNT;
      if (p >= 1) {
        smilePhaseRef.current = 2;
        smilePhaseTimeRef.current = 0;
      }
    } else if (smilePhaseRef.current === 2) {
      smilePhaseTimeRef.current += dt;
      smileAmount = SMILE_AMOUNT;
      if (smilePhaseTimeRef.current >= SMILE_HOLD) {
        smilePhaseRef.current = 3;
        smilePhaseTimeRef.current = 0;
      }
    } else {
      smilePhaseTimeRef.current += dt;
      const p = Math.min(1, smilePhaseTimeRef.current / SMILE_FADE_OUT);
      smileAmount = (1 - p) * SMILE_AMOUNT;
      if (p >= 1) {
        smilePhaseRef.current = 0;
        nextSmileTimeRef.current = lifeTime + 8 + Math.random() * 7;
      }
    }
    if (smileAmount > 0) {
      target.mouthSmileLeft = (target.mouthSmileLeft ?? 0) + smileAmount;
      target.mouthSmileRight = (target.mouthSmileRight ?? 0) + smileAmount;
    }

    // ── Step 3: Smooth towards target weights ──
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

    // ── Step 4: Apply to mesh morph targets ──
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

    // ── Step 5: (disabled) Head gesture ──
    // The previous head wobble sometimes pushed the head into unnatural poses.
    // For now we rely entirely on the sitting animation so the head stays neutral and stable.
    return;
  });

  return (
    <group
      ref={groupRef}
      position={AVATAR_WORLD.position}
      rotation={AVATAR_WORLD.rotation}
      scale={AVATAR_WORLD.scale}
    >
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
    const s = 2 / maxDim;
    console.info("[Engine] raw size:", size, "center:", center, "scale:", s);
    setEngineScale(s);
    setEngineCenter(center);
  }, [scene]);

  if (!scene || engineScale === null || !engineCenter) return null;

  // Place on the desk surface — offset so the model's center sits at the target position
  return (
    <group
      ref={groupRef}
      position={[-0.4, 1.2, -1.6]}
      scale={engineScale}
    >
      <primitive object={scene} position={[-engineCenter.x, -engineCenter.y, -engineCenter.z]} />
    </group>
  );
}

// ─── Brass Machine (floor prop, right side) ───────────────────────────

function BrassMachine() {
  const { scene } = useGLTF(BRASS_MACHINE_PATH);
  const groupRef = useRef<Group>(null);
  const ready = useRef(false);
  const [machineScale, setMachineScale] = useState<number | null>(null);
  const [machineCenter, setMachineCenter] = useState<THREE.Vector3 | null>(null);

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

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const s = 2.8 / maxDim;
    console.info("[BrassMachine] raw size:", size, "center:", center, "scale:", s);
    setMachineScale(s);
    setMachineCenter(center);
  }, [scene]);

  if (!scene || machineScale === null || !machineCenter) return null;

  // Place on the ground to the right
  return (
    <group
      ref={groupRef}
      position={[1.5, -0.2, -1.5]}
      scale={machineScale}
    >
      <primitive object={scene} position={[-machineCenter.x, -machineCenter.y, -machineCenter.z]} />
    </group>
  );
}

// ─── Mechanical Loom (floor prop, next to brass machine) ──────────────

function MechanicalLoom() {
  const { scene } = useGLTF(LOOM_PATH);
  const groupRef = useRef<Group>(null);
  const ready = useRef(false);
  const [loomScale, setLoomScale] = useState<number | null>(null);
  const [loomCenter, setLoomCenter] = useState<THREE.Vector3 | null>(null);

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

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const s = 2 / maxDim;
    console.info("[MechanicalLoom] raw size:", size, "center:", center, "scale:", s);
    setLoomScale(s);
    setLoomCenter(center);
  }, [scene]);

  if (!scene || loomScale === null || !loomCenter) return null;

  return (
    <group
      ref={groupRef}
      position={[3, -0.2, -1.5]}
      scale={loomScale}
    >
      <primitive object={scene} position={[-loomCenter.x, -loomCenter.y, -loomCenter.z]} />
    </group>
  );
}

// ─── Ada Cadre (floor prop) ───────────────────────────────────────────

function AdaCadre() {
  const { scene } = useGLTF(ADA_CADRE_PATH);
  const groupRef = useRef<Group>(null);
  const ready = useRef(false);
  const [cadreScale, setCadreScale] = useState<number | null>(null);
  const [cadreCenter, setCadreCenter] = useState<THREE.Vector3 | null>(null);

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

    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const s = 1.5 / maxDim;
    console.info("[AdaCadre] raw size:", size, "center:", center, "scale:", s);
    setCadreScale(s);
    setCadreCenter(center);
  }, [scene]);

  if (!scene || cadreScale === null || !cadreCenter) return null;

  return (
    <group
      ref={groupRef}
      position={[4.1, 1.9, -4.9]}
      scale={cadreScale}
    >
      <primitive object={scene} position={[-cadreCenter.x, -cadreCenter.y, -cadreCenter.z]} />
    </group>
  );
}

// ─── Main Scene ───────────────────────────────────────────────────────

export function AvatarScene({
  volume,
  bandsRef,
  lipSyncRef,
  consumeVisemes,
  useFallback = false,
  isConnected = false,
}: {
  volume: number;
  bandsRef?: React.RefObject<AudioBands>;
  lipSyncRef?: React.RefObject<LipSyncState>;
  consumeVisemes?: (bandsRef: React.RefObject<AudioBands> | undefined, delta: number) => void;
  useFallback?: boolean;
  isConnected?: boolean;
}) {
  const avatarAvailable = useAvatarAvailable();
  const showGlb = !useFallback && avatarAvailable === true;

  return (
    <div className="canvas-wrap" style={{ position: "absolute", inset: 0 }}>
      <Canvas
        shadows
        camera={{ position: [0, 3, 4], fov: 50 }}
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
          target={[-0.28, 0.25, -1.46]}
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
        {/* <Suspense fallback={null}>
          <AnalyticalEngine />
        </Suspense> */}

        {/* Brass Machine on the floor, right side */}
        <Suspense fallback={null}>
          <BrassMachine />
        </Suspense>

        {/* Mechanical Loom, next to brass machine */}
        <Suspense fallback={null}>
          <MechanicalLoom />
        </Suspense>

        {/* Ada Cadre */}
        <Suspense fallback={null}>
          <AdaCadre />
        </Suspense>

        {/* Avatar */}
        <Suspense fallback={<FallbackAvatar />}>
          {showGlb ? (
            <GLBErrorBoundary volume={volume} bandsRef={bandsRef}>
              <AvatarModel volume={volume} bandsRef={bandsRef} lipSyncRef={lipSyncRef} consumeVisemes={consumeVisemes} isConnected={isConnected} />
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
          position={[
            AVATAR_WORLD.position[0],
            AVATAR_SHADOW_FLOOR_Y,
            AVATAR_WORLD.position[2] - 0.22,
          ]}
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
