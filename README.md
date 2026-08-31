# Verse Match

Obsidian plugin that matches selected prose to scripture. Companion to [Bible Verse](https://github.com/kilrkrow/obsidian-bible-verse).

Highlight a sentence, run **Match selection to scripture** (command or editor context menu). Unique matches replace immediately. Ambiguous matches open a chooser (`1/3`). Skip, Cancel, or Insert.

## Backends

**Local cache is the default.** HelloAO has dumps, not a search HTTP route, so the plugin downloads `complete.simple.json` once per translation and caches an index beside the plugin.

**Custom API** is a drop-in in settings (placeholder `https://verseapi.org`). Leave the URL empty, or if the request fails, Verse Match falls back to the local cache.

Reads bible-verse `defaultTranslation` (falls back to KJV). Does not modify bible-verse. No API keys.

## Inserts

- Highlight off: `{John 3:16}`
- Highlight on (default): a baked ```bible fence with optional `==gist==` around the overlapping span

```bible
John 3:16
translation: KJV
---
16. ==For God so loved the world==, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.
```

The settings toggle is **Attempt to highlight the relevant portion of the verse**. The chooser checkbox starts from that setting and can differ per insert.

## Install

1. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/verse-match/`
2. Enable **Verse Match** in Obsidian Settings, Community plugins


## Releasing

Bump `manifest.json` on `main` (and `package.json` if you keep versions in sync). Then on GitHub: **Releases -> Draft a new release**. Tag = the version with no `v` prefix (currently `0.1.0`), target `main`, Publish, attach nothing.

`.github/workflows/release.yml` builds `main.js` / `styles.css` in CI, attests provenance, and uploads `main.js`, `manifest.json`, and `styles.css` onto that release.

Do not attach local builds. Provenance is tied to the Action's OIDC identity.

## License

[GPL-3.0](LICENSE) (same as Bible Verse)
