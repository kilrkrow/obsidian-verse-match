import type { IndexedVerse } from "./helloao";

export interface Candidate {
  verse: IndexedVerse;
  score: number;
}

export interface ClassifyResult {
  kind: "exact" | "choice" | "none";
  best: Candidate | null;
  candidates: Candidate[];
}

export function normalize(s: string): string {
  return s
    .replace(/\u00b6/g, " ")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((w) => w.length > 1);
}

function scoreVerse(sentenceNorm: string, verse: IndexedVerse): number {
  const vNorm = normalize(verse.text);
  if (!sentenceNorm || !vNorm) return 0;
  if (vNorm === sentenceNorm) return 1;
  if (sentenceNorm.length >= 18 && vNorm.startsWith(sentenceNorm)) return 0.97;
  if (sentenceNorm.length >= 18 && vNorm.includes(sentenceNorm)) return 0.93;
  if (vNorm.length >= 18 && sentenceNorm.startsWith(vNorm)) return 0.9;

  const a = new Set(tokens(sentenceNorm));
  const b = new Set(tokens(vNorm));
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const jaccard = inter / (a.size + b.size - inter);
  const coverage = inter / a.size;
  return jaccard * 0.5 + coverage * 0.5;
}

export function classify(sentence: string, index: IndexedVerse[], limit = 8): ClassifyResult {
  const sentenceNorm = normalize(sentence);
  if (sentenceNorm.length < 8) {
    return { kind: "none", best: null, candidates: [] };
  }

  const scored: Candidate[] = [];
  for (const verse of index) {
    const s = scoreVerse(sentenceNorm, verse);
    if (s >= 0.45) scored.push({ verse, score: s });
  }
  scored.sort((x, y) => y.score - x.score);
  const candidates = scored.slice(0, limit);
  if (candidates.length === 0) {
    return { kind: "none", best: null, candidates: [] };
  }

  const top = candidates[0];
  const second = candidates[1];
  const uniqueStrong =
    top.score >= 0.88 && (!second || top.score - second.score >= 0.08 || second.score < 0.8);

  if (uniqueStrong) {
    return { kind: "exact", best: top, candidates };
  }
  return { kind: "choice", best: top, candidates };
}

export function formatToken(
  verse: IndexedVerse,
  translationAbbr: string,
  defaultAbbr: string
): string {
  const ref = `${verse.book} ${verse.chapter}:${verse.verse}`;
  if (!translationAbbr || translationAbbr === defaultAbbr) {
    return `{${ref}}`;
  }
  return `{${ref}, ${translationAbbr}}`;
}
