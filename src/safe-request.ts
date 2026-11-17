import { API_URL_REJECTED_NOTICE, isAllowedApiUrl } from "./url-policy";

/** One HTTP hop. A transport must NOT follow redirects; it returns 3xx with its Location. */
export interface RawResponse {
  status: number;
  location?: string | null;
  text: string;
}

export type RawTransport = (url: string) => Promise<RawResponse>;

export const REDIRECT_REFUSED_NOTICE =
  "Custom API redirected to a URL that is not https://; using local cache.";

/** A redirect (or redirect-like response) that would leave the allowed URL policy. */
export class UnsafeRedirectError extends Error {
  constructor(message = REDIRECT_REFUSED_NOTICE) {
    super(message);
    this.name = "UnsafeRedirectError";
  }
}

const MAX_REDIRECTS = 5;

/**
 * GET `url` through `transport`, following redirects one hop at a time. Every hop,
 * including the first, must pass isAllowedApiUrl; a redirect that fails is refused
 * before any request is made to it.
 */
export async function safeRequest(
  url: string,
  transport: RawTransport
): Promise<{ status: number; json: unknown }> {
  let current = (url || "").trim();
  if (!isAllowedApiUrl(current)) throw new Error(API_URL_REJECTED_NOTICE);
  for (let redirects = 0; ; redirects++) {
    const res = await transport(current);
    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Error(`Search API ${res.status} without Location`);
      if (redirects >= MAX_REDIRECTS) throw new Error("Search API: too many redirects");
      let next: string;
      try {
        next = new URL(res.location, current).href;
      } catch {
        throw new UnsafeRedirectError();
      }
      if (!isAllowedApiUrl(next)) throw new UnsafeRedirectError();
      current = next;
      continue;
    }
    let json: unknown = null;
    if (res.status >= 200 && res.status < 300) {
      try {
        json = JSON.parse(res.text);
      } catch {
        throw new Error("Search API: invalid JSON");
      }
    }
    return { status: res.status, json };
  }
}