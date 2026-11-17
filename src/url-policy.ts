/**
 * Custom API URL policy: only https:// is allowed, plus plain http:// to
 * localhost or 127.0.0.1 for local development.
 */
export const API_URL_REJECTED_NOTICE =
  "Custom API URL must start with https:// (http:// is allowed only for localhost or 127.0.0.1).";

export function isAllowedApiUrl(raw: string): boolean {
  const value = (raw || "").trim();
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!url.hostname) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:") {
    return url.hostname === "localhost" || url.hostname === "127.0.0.1";
  }
  return false;
}

/**
 * Save-time check for the Custom API URL setting. Empty clears the setting.
 * Returns the value to store, or null when the URL is refused (a notice is shown
 * through `notify` and nothing should be saved).
 */
export function validateApiUrlSetting(raw: string, notify: (msg: string) => void): string | null {
  const value = (raw || "").trim();
  if (!value) return "";
  if (!isAllowedApiUrl(value)) {
    notify(API_URL_REJECTED_NOTICE);
    return null;
  }
  return value;
}