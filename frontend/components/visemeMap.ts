/**
 * Text-to-viseme mapping for lip sync.
 *
 * Converts English text into sequences of Oculus viseme keys, and provides
 * morph-target weight presets for each viseme so the avatar's mouth forms
 * the correct shape for every sound.
 */

// ─── Oculus 15-viseme set (matches the avatar's blend shapes) ──────────

export type VisemeKey =
  | "viseme_sil"
  | "viseme_PP"
  | "viseme_FF"
  | "viseme_TH"
  | "viseme_DD"
  | "viseme_kk"
  | "viseme_CH"
  | "viseme_SS"
  | "viseme_nn"
  | "viseme_RR"
  | "viseme_aa"
  | "viseme_E"
  | "viseme_I"
  | "viseme_O"
  | "viseme_U";

export const VISEME_KEYS: VisemeKey[] = [
  "viseme_sil", "viseme_PP", "viseme_FF", "viseme_TH",
  "viseme_DD", "viseme_kk", "viseme_CH", "viseme_SS",
  "viseme_nn", "viseme_RR", "viseme_aa", "viseme_E",
  "viseme_I", "viseme_O", "viseme_U",
];

// ─── Morph-target weight presets per viseme ────────────────────────────
// Each viseme maps to a set of morph target weights that produce
// a visually distinct, natural mouth shape.

export type MorphWeights = Record<string, number>;

export const VISEME_MORPH_PRESETS: Record<VisemeKey, MorphWeights> = {
  viseme_sil: {
    jawOpen: 0, mouthOpen: 0,
  },
  viseme_PP: {
    // Lips pressed together — P, B, M
    jawOpen: 0.03, mouthOpen: 0,
    mouthPressLeft: 0.35, mouthPressRight: 0.35,
    mouthClose: 0.2,
    viseme_PP: 0.6,
  },
  viseme_FF: {
    // Lower lip tucked under upper teeth — F, V
    jawOpen: 0.06, mouthOpen: 0.02,
    mouthRollLower: 0.35,
    mouthUpperUpLeft: 0.06, mouthUpperUpRight: 0.06,
    viseme_FF: 0.6,
  },
  viseme_TH: {
    // Tongue between teeth — TH
    jawOpen: 0.12, mouthOpen: 0.08,
    tongueOut: 0.25,
    viseme_TH: 0.55,
  },
  viseme_DD: {
    // Tongue behind upper teeth — T, D
    jawOpen: 0.15, mouthOpen: 0.10,
    mouthStretchLeft: 0.05, mouthStretchRight: 0.05,
    viseme_DD: 0.55,
  },
  viseme_kk: {
    // Back of mouth, jaw slightly open — K, G, NG
    jawOpen: 0.14, mouthOpen: 0.10,
    mouthShrugUpper: 0.08,
    viseme_kk: 0.55,
  },
  viseme_CH: {
    // Slight pucker, teeth close — CH, SH, J
    jawOpen: 0.08, mouthOpen: 0.04,
    mouthPucker: 0.22, mouthFunnel: 0.15,
    viseme_CH: 0.55,
  },
  viseme_SS: {
    // Teeth close together, lips slightly spread — S, Z
    jawOpen: 0.04, mouthOpen: 0.02,
    mouthStretchLeft: 0.22, mouthStretchRight: 0.22,
    mouthClose: 0.10,
    viseme_SS: 0.6,
  },
  viseme_nn: {
    // Tongue up, mouth slightly open — N, L
    jawOpen: 0.10, mouthOpen: 0.06,
    mouthShrugLower: 0.08,
    viseme_nn: 0.55,
  },
  viseme_RR: {
    // Lips slightly rounded — R
    jawOpen: 0.12, mouthOpen: 0.08,
    mouthPucker: 0.18, mouthFunnel: 0.12,
    viseme_RR: 0.55,
  },
  viseme_aa: {
    // Wide open — A, "ah"
    jawOpen: 0.38, mouthOpen: 0.28,
    mouthLowerDownLeft: 0.14, mouthLowerDownRight: 0.14,
    mouthUpperUpLeft: 0.05, mouthUpperUpRight: 0.05,
    viseme_aa: 0.65,
  },
  viseme_E: {
    // Mid-open, lips spread — E, "eh"
    jawOpen: 0.18, mouthOpen: 0.12,
    mouthStretchLeft: 0.18, mouthStretchRight: 0.18,
    mouthSmileLeft: 0.06, mouthSmileRight: 0.06,
    viseme_E: 0.6,
  },
  viseme_I: {
    // Lips spread, jaw barely open — I, "ee"
    jawOpen: 0.08, mouthOpen: 0.04,
    mouthStretchLeft: 0.28, mouthStretchRight: 0.28,
    mouthSmileLeft: 0.12, mouthSmileRight: 0.12,
    viseme_I: 0.6,
  },
  viseme_O: {
    // Rounded open — O, "oh"
    jawOpen: 0.28, mouthOpen: 0.18,
    mouthPucker: 0.28, mouthFunnel: 0.22,
    viseme_O: 0.65,
  },
  viseme_U: {
    // Tight round, barely open — U, "oo"
    jawOpen: 0.08, mouthOpen: 0.04,
    mouthPucker: 0.38, mouthFunnel: 0.28,
    viseme_U: 0.6,
  },
};

// ─── Grapheme → Viseme mapping ─────────────────────────────────────────
// Trigraphs and digraphs are checked before single letters.

const TRIGRAPH_MAP: Record<string, VisemeKey> = {
  igh: "viseme_aa",
  tch: "viseme_CH",
  dge: "viseme_CH",
};

const DIGRAPH_MAP: Record<string, VisemeKey> = {
  th: "viseme_TH",
  sh: "viseme_CH",
  ch: "viseme_CH",
  ph: "viseme_FF",
  wh: "viseme_U",
  ng: "viseme_kk",
  nk: "viseme_kk",
  ck: "viseme_kk",
  qu: "viseme_kk",
  // Vowel digraphs
  ee: "viseme_I",
  ea: "viseme_I",
  oo: "viseme_U",
  ou: "viseme_aa",
  ow: "viseme_O",
  oa: "viseme_O",
  ai: "viseme_E",
  ay: "viseme_E",
  oi: "viseme_O",
  oy: "viseme_O",
  au: "viseme_aa",
  aw: "viseme_aa",
  ei: "viseme_E",
  ey: "viseme_E",
  ie: "viseme_I",
  ue: "viseme_U",
  ew: "viseme_U",
};

const LETTER_MAP: Record<string, VisemeKey> = {
  a: "viseme_aa",
  b: "viseme_PP",
  c: "viseme_kk",
  d: "viseme_DD",
  e: "viseme_E",
  f: "viseme_FF",
  g: "viseme_kk",
  h: "viseme_sil",
  i: "viseme_I",
  j: "viseme_CH",
  k: "viseme_kk",
  l: "viseme_nn",
  m: "viseme_PP",
  n: "viseme_nn",
  o: "viseme_O",
  p: "viseme_PP",
  q: "viseme_kk",
  r: "viseme_RR",
  s: "viseme_SS",
  t: "viseme_DD",
  u: "viseme_U",
  v: "viseme_FF",
  w: "viseme_U",
  x: "viseme_kk",
  y: "viseme_I",
  z: "viseme_SS",
};

/**
 * Convert a single word into a sequence of viseme keys.
 * Uses trigraph → digraph → single-letter rules to approximate
 * the mouth shapes needed for English pronunciation.
 */
export function wordToVisemes(word: string): VisemeKey[] {
  const visemes: VisemeKey[] = [];
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (lower.length === 0) return visemes;

  let i = 0;
  while (i < lower.length) {
    // Check trigraphs
    if (i + 2 < lower.length) {
      const tri = lower[i] + lower[i + 1] + lower[i + 2];
      if (TRIGRAPH_MAP[tri]) {
        visemes.push(TRIGRAPH_MAP[tri]);
        i += 3;
        continue;
      }
    }
    // Check digraphs
    if (i + 1 < lower.length) {
      const di = lower[i] + lower[i + 1];
      if (DIGRAPH_MAP[di]) {
        visemes.push(DIGRAPH_MAP[di]);
        i += 2;
        continue;
      }
    }
    // Silent e at end of word
    if (lower[i] === "e" && i === lower.length - 1 && lower.length > 2) {
      i++;
      continue;
    }
    // Single letter
    const vis = LETTER_MAP[lower[i]];
    if (vis) visemes.push(vis);
    i++;
  }

  // Remove consecutive duplicate visemes for more natural movement
  const deduped: VisemeKey[] = [];
  for (const v of visemes) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== v) {
      deduped.push(v);
    }
  }

  return deduped;
}

/**
 * Convert a full text string (sentence/phrase) into a flat viseme
 * sequence with brief silence gaps between words.
 */
export function textToVisemes(text: string): VisemeKey[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const result: VisemeKey[] = [];
  for (let wi = 0; wi < words.length; wi++) {
    const wv = wordToVisemes(words[wi]);
    result.push(...wv);
    // Short silence between words (except after last word)
    if (wi < words.length - 1 && wv.length > 0) {
      result.push("viseme_sil");
    }
  }
  return result;
}
