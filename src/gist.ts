import { normalize } from "./classifier";

export interface CharSpan {
  start: number;
  end: number;
}

interface VerseTok {
  norm: string;
  start: number;
  end: number;
}

function verseTokens(verse: string): VerseTok[] {
  const toks: VerseTok[] = [];
  const re = /[A-Za-z0-9]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(verse))) {
    const norm = normalize(m[0]);
    if (norm.length > 1) toks.push({ norm, start: m.index, end: m.index + m[0].length });
  }
  return toks;
}

/** Best contiguous verse substring overlapping the lookup. Attempt, not perfect. */
export function findGistSpan(selection: string, verse: string): CharSpan | null {
  const selToks = normalize(selection).split(" ").filter((w) => w.length > 1);
  if (selToks.length < 2) return null;
  const selSet = new Set(selToks);
  const vToks = verseTokens(verse);
  if (vToks.length === 0) return null;

  const hit = vToks.map((t) => selSet.has(t.norm));
  let bestI = 0;
  let bestJ = -1;
  let bestScore = 0;
  let bestLen = 1e9;

  for (let i = 0; i < hit.length; i++) {
    if (!hit[i]) continue;
    let matches = 0;
    let last = i;
    for (let j = i; j < hit.length; j++) {
      if (hit[j]) {
        matches++;
        last = j;
        const spanLen = vToks[last].end - vToks[i].start;
        if (matches > bestScore || (matches === bestScore && spanLen < bestLen)) {
          bestScore = matches;
          bestI = i;
          bestJ = last;
          bestLen = spanLen;
        }
      } else if (!(j + 1 < hit.length && hit[j + 1])) {
        break;
      }
    }
  }

  if (bestJ < 0) return null;
  const start = vToks[bestI].start;
  const end = vToks[bestJ].end;
  const coverage = bestScore / selToks.length;
  const spanLen = end - start;
  if (bestScore < 3 && spanLen < 12) return null;
  if (coverage < 0.35) return null;
  return { start, end };
}

export function wrapGist(verse: string, span: CharSpan | null): string {
  const text = verse.replace(/^[\u00b6\s]+/, "");
  if (!span) return text;
  if (span.start < 0 || span.end > text.length || span.start >= span.end) return text;
  return text.slice(0, span.start) + "==" + text.slice(span.start, span.end) + "==" + text.slice(span.end);
}

export function formatInsert(
  match: { book: string; chapter: number; verse: number; text: string; token: string },
  sentence: string,
  opts: { highlight: boolean; abbr: string; calloutType?: string }
): string {
  if (!opts.highlight) return match.token;
  const cleaned = match.text.replace(/^[\u00b6\s]+/, "");
  const span = findGistSpan(sentence, cleaned);
  const body = wrapGist(cleaned, span);
  const ref = `${match.book} ${match.chapter}:${match.verse}`;
  const numbered = `${match.verse}. ${body}`;
  return ["```bible", ref, `translation: ${opts.abbr}`, "---", numbered, "```"].join("\n");
}
