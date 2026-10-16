# Verse Match

Highlight prose in Obsidian to find matching Bible verses and insert them as formatted citations.

Looking up scripture references while writing means switching apps, searching, copying, formatting — and then losing your train of thought. Verse Match searches a local cache and inserts a formatted ` ```bible ` block without leaving your vault.

## What it does

- **Highlight to search** — select any sentence, run "Match selection to scripture" from the command palette or editor context menu
- **Local-first** — downloads the translation index once and searches it locally; no API key, no outbound request per lookup
- **Chooser for ambiguous matches** — when multiple verses match, a numbered picker (`1/3`) lets you skip, cancel or insert the right one
- **Formatted output** — inserts a ` ```bible ` fence with the verse text and optional `==gist==` highlighting around the overlapping span
- **Custom API backend** — point the plugin at your own search endpoint in settings; falls back to local cache on failure
- **Reads `bible-verse` translation setting** — picks up the `defaultTranslation` from the companion plugin automatically (falls back to KJV)

## Quick start

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/kilrkrow/obsidian-verse-match/releases)
2. Copy them into `<vault>/.obsidian/plugins/verse-match/`
3. Enable **Verse Match** in Obsidian Settings > Community plugins
4. Highlight a sentence in any note and run **Match selection to scripture**

Example output:

```bible
John 3:16
translation: KJV
---
16. ==For God so loved the world==, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.
```

## Backends

**Local cache (default):** downloads `complete.simple.json` for the active translation on first use and builds a search index beside the plugin. No API key required.

**Custom API:** enter a base URL in settings (e.g. `https://verseapi.org`). Leave it empty or let a request fail to fall back to local cache.

## License

[GPL-3.0](LICENSE)

## Feedback

Questions, ideas and bug reports are welcome in [Issues](https://github.com/kilrkrow/obsidian-verse-match/issues).

---

Built by Guy Schamp · [Fox & Dove](https://foxanddoveconsulting.com) · more tools at [github.com/kilrkrow](https://github.com/kilrkrow)
