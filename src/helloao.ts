import { requestUrl } from "obsidian";

export const HELLOAO_API = "https://bible.helloao.org/api";

export interface IndexedVerse {
  bookId: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

interface SimpleComplete {
  books: {
    id: string;
    name: string;
    commonName: string;
    chapters: {
      chapter: {
        number: number;
        content: { type: string; number: number; text?: string }[];
      };
    }[];
  }[];
}

const memory = new Map<string, IndexedVerse[]>();

export async function loadIndex(
  translationId: string,
  cacheWrite?: (json: string) => Promise<void>,
  cacheRead?: () => Promise<string | null>
): Promise<IndexedVerse[]> {
  const hit = memory.get(translationId);
  if (hit) return hit;

  if (cacheRead) {
    try {
      const raw = await cacheRead();
      if (raw) {
        const parsed = JSON.parse(raw) as IndexedVerse[];
        if (Array.isArray(parsed) && parsed.length > 1000) {
          memory.set(translationId, parsed);
          return parsed;
        }
      }
    } catch {
      /* rebuild */
    }
  }

  const url = `${HELLOAO_API}/${encodeURIComponent(translationId)}/complete.simple.json`;
  const res = await requestUrl({ url });
  if (res.status !== 200) {
    throw new Error(`HelloAO ${res.status} for ${url}`);
  }
  const data = res.json as SimpleComplete;
  const index: IndexedVerse[] = [];
  for (const book of data.books ?? []) {
    const bookName = book.commonName || book.name || book.id;
    for (const ch of book.chapters ?? []) {
      const n = ch.chapter?.number;
      for (const item of ch.chapter?.content ?? []) {
        if (item.type !== "verse" || !item.text) continue;
        index.push({
          bookId: book.id,
          book: bookName,
          chapter: n,
          verse: item.number,
          text: item.text,
        });
      }
    }
  }
  memory.set(translationId, index);
  if (cacheWrite) {
    try {
      await cacheWrite(JSON.stringify(index));
    } catch {
      /* ignore cache write */
    }
  }
  return index;
}

/** Test helper: build an index from already-parsed complete.simple JSON. */
export function indexFromComplete(data: SimpleComplete): IndexedVerse[] {
  const index: IndexedVerse[] = [];
  for (const book of data.books ?? []) {
    const bookName = book.commonName || book.name || book.id;
    for (const ch of book.chapters ?? []) {
      const n = ch.chapter?.number;
      for (const item of ch.chapter?.content ?? []) {
        if (item.type !== "verse" || !item.text) continue;
        index.push({
          bookId: book.id,
          book: bookName,
          chapter: n,
          verse: item.number,
          text: item.text,
        });
      }
    }
  }
  return index;
}
