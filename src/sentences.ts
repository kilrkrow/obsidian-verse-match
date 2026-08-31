export interface SentenceSpan {
  text: string;
  from: number;
  to: number;
}

/** Split a selection into sentences. Offsets are relative to the selection start. */
export function splitSentences(selection: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  const re = /[^.?!\n]+[.?!]+|[^.?!\n]+$/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selection))) {
    const raw = m[0];
    const lead = raw.search(/\S/);
    if (lead < 0) continue;
    let start = m.index + lead;
    let end = m.index + raw.length;
    while (end > start && /\s/.test(selection[end - 1])) end--;
    const text = selection.slice(start, end).trim();
    if (text.length < 2) continue;
    spans.push({ text, from: start, to: end });
  }
  return spans;
}
