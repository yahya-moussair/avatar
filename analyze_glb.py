"""
GLB Analyzer — reads the JSON chunk of a .glb file without any dependencies.
Prints: meshes, morph targets, bones, animations, and skin info.
"""
import json
import struct
import sys
from pathlib import Path

def analyze_glb(filepath: str):
    with open(filepath, "rb") as f:
        magic = f.read(4)
        if magic != b"glTF":
            print("ERROR: Not a valid GLB file")
            return

        version = struct.unpack("<I", f.read(4))[0]
        length  = struct.unpack("<I", f.read(4))[0]

        # First chunk is always JSON
        chunk_len  = struct.unpack("<I", f.read(4))[0]
        chunk_type = f.read(4)
        json_data  = f.read(chunk_len)

    gltf = json.loads(json_data.decode("utf-8"))

    print(f"\n{'='*60}")
    print(f"FILE : {filepath}")
    print(f"glTF version: {version}")
    print(f"{'='*60}")

    # ── Meshes & morph targets ────────────────────────────────────
    meshes = gltf.get("meshes", [])
    print(f"\n-- MESHES ({len(meshes)}) --")
    for mesh in meshes:
        name = mesh.get("name", "<unnamed>")
        prims = mesh.get("primitives", [])
        print(f"  Mesh: '{name}'  ({len(prims)} primitives)")
        for i, prim in enumerate(prims):
            targets = prim.get("targets", [])
            extras  = mesh.get("extras", {})
            target_names = extras.get("targetNames", [])
            if targets:
                print(f"    Primitive {i}: {len(targets)} morph targets")
                for j, t in enumerate(targets):
                    tname = target_names[j] if j < len(target_names) else f"target_{j}"
                    keys  = list(t.keys())
                    print(f"      [{j:02d}] '{tname}'  attrs={keys}")
            else:
                print(f"    Primitive {i}: no morph targets")

    # ── Nodes (bones / skeleton) ──────────────────────────────────
    nodes = gltf.get("nodes", [])
    skins = gltf.get("skins", [])
    print(f"\n-- SKINS / SKELETON ({len(skins)}) --")
    for skin in skins:
        sname  = skin.get("name", "<unnamed>")
        joints = skin.get("joints", [])
        print(f"  Skin: '{sname}'  —  {len(joints)} joints")
        bone_names = []
        for jidx in joints:
            bname = nodes[jidx].get("name", f"node_{jidx}") if jidx < len(nodes) else f"node_{jidx}"
            bone_names.append(bname)
        # Print bones, 4 per line
        for k in range(0, len(bone_names), 4):
            print("    " + "  |  ".join(bone_names[k:k+4]))

    # ── Animations ───────────────────────────────────────────────
    animations = gltf.get("animations", [])
    print(f"\n-- ANIMATIONS ({len(animations)}) --")
    for anim in animations:
        aname      = anim.get("name", "<unnamed>")
        channels   = anim.get("channels", [])
        samplers   = anim.get("samplers", [])
        print(f"  '{aname}'  ({len(channels)} channels, {len(samplers)} samplers)")

    # ── Quick morph-target summary ────────────────────────────────
    print(f"\n-- MORPH TARGET SUMMARY --")
    all_targets = []
    for mesh in meshes:
        extras = mesh.get("extras", {})
        tnames = extras.get("targetNames", [])
        all_targets.extend(tnames)

    if all_targets:
        print(f"  Total named morph targets: {len(all_targets)}")
        mouth_keys = ["mouth","jaw","viseme","lip","speak","open","close","smile",
                      "aa","ee","ih","oh","ou","pp","ff","th","dd","kk","ch","ss",
                      "nn","rr","sil","mbp"]
        print("\n  Mouth / viseme targets:")
        found = [t for t in all_targets if any(k in t.lower() for k in mouth_keys)]
        if found:
            for t in found:
                print(f"    '{t}'")
        else:
            print("    (none found — check bone-based animation)")

        print("\n  Eye / blink targets:")
        eye_keys = ["eye","blink","wink","pupil"]
        found_eye = [t for t in all_targets if any(k in t.lower() for k in eye_keys)]
        if found_eye:
            for t in found_eye:
                print(f"    '{t}'")
        else:
            print("    (none found)")

        print("\n  Brow / expression targets:")
        brow_keys = ["brow","brow","eyebrow","expr","angry","happy","sad","surprise","fear"]
        found_brow = [t for t in all_targets if any(k in t.lower() for k in brow_keys)]
        if found_brow:
            for t in found_brow:
                print(f"    '{t}'")
        else:
            print("    (none found)")

        print("\n  ALL morph targets (alphabetical):")
        for t in sorted(all_targets):
            print(f"    '{t}'")
    else:
        print("  No named morph targets found — animation must be bone-based.")

    print(f"\n{'='*60}\n")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\yahya\Desktop\Lionsgeek\avatar\avatar\avatars\avtarr.glb"
    analyze_glb(path)
