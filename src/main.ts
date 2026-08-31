import { Notice, Plugin, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type { App } from "obsidian";
import { abbrForId, DEFAULT_TRANSLATION_ID, HELLOAO_TRANSLATIONS } from "./translations";
import { loadIndex } from "./helloao";
import { splitSentences } from "./sentences";
import { ScriptureChooserModal } from "./chooser-modal";
import {
  HttpSearchBackend,
  LocalCacheBackend,
  decideKind,
  type SearchBackend,
  type SearchMatch,
} from "./search-backend";
import { formatInsert } from "./gist";

interface VerseMatchSettings {
  backend: "local" | "http";
  customApiUrl: string;
  highlightGist: boolean;
}

const DEFAULT_SETTINGS: VerseMatchSettings = {
  backend: "local",
  customApiUrl: "",
  highlightGist: true,
};


function parseSettings(raw: unknown): VerseMatchSettings {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    backend: src.backend === "http" ? "http" : DEFAULT_SETTINGS.backend,
    customApiUrl: typeof src.customApiUrl === "string" ? src.customApiUrl : DEFAULT_SETTINGS.customApiUrl,
    highlightGist: typeof src.highlightGist === "boolean" ? src.highlightGist : DEFAULT_SETTINGS.highlightGist,
  };
}

export default class VerseMatchPlugin extends Plugin {
  settings: VerseMatchSettings = { ...DEFAULT_SETTINGS };

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new VerseMatchSettingTab(this.app, this));

    this.addCommand({
      id: "match-selection-to-scripture",
      name: "Match selection to scripture",
      editorCallback: async (editor) => {
        await this.matchSelection(editor);
      },
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        menu.addItem((item) => {
          item
            .setTitle("Match selection to scripture")
            .setIcon("book-open")
            .onClick(() => this.matchSelection(editor));
        });
      })
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = parseSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private bibleVerseTranslation(): { id: string; abbr: string } {
    const bv = (
      this.app as unknown as {
        plugins?: { plugins?: Record<string, { settings?: { defaultTranslation?: string; nativeCalloutType?: string } }> };
      }
    ).plugins?.plugins?.["bible-verse"];
    const id = bv?.settings?.defaultTranslation || DEFAULT_TRANSLATION_ID;
    const known = HELLOAO_TRANSLATIONS.find((t) => t.id === id);
    return { id, abbr: known?.abbr ?? abbrForId(id) };
  }

  private bibleVerseCalloutType(): string {
    const bv = (
      this.app as unknown as {
        plugins?: { plugins?: Record<string, { settings?: { nativeCalloutType?: string } }> };
      }
    ).plugins?.plugins?.["bible-verse"];
    return bv?.settings?.nativeCalloutType || "quote";
  }

  private cachePath(translationId: string): string {
    return `${this.manifest.dir}/cache-${translationId}.json`;
  }

  private makeLocalBackend(): LocalCacheBackend {
    const { abbr: defaultAbbr } = this.bibleVerseTranslation();
    return new LocalCacheBackend({
      loadIndex: (id) =>
        loadIndex(
          id,
          async (json) => {
            await this.app.vault.adapter.write(this.cachePath(id), json);
          },
          async () => {
            const p = this.cachePath(id);
            if (await this.app.vault.adapter.exists(p)) {
              return this.app.vault.adapter.read(p);
            }
            return null;
          }
        ),
      abbrFor: (id) => HELLOAO_TRANSLATIONS.find((t) => t.id === id)?.abbr ?? abbrForId(id),
      defaultAbbr,
    });
  }

  private getBackend(): SearchBackend {
    const local = this.makeLocalBackend();
    if (this.settings.backend !== "http") return local;

    const base = (this.settings.customApiUrl || "").trim();
    if (!base) {
      new Notice("Custom API URL is empty; using local cache.");
      return local;
    }

    const http = new HttpSearchBackend(base, async (url) => {
      const res = await requestUrl({ url });
      return { status: res.status, json: res.json };
    });

    let useLocal = false;
    let noticed = false;
    return {
      search: async (query, translationId, limit) => {
        if (useLocal) return local.search(query, translationId, limit);
        try {
          return await http.search(query, translationId, limit);
        } catch {
          useLocal = true;
          if (!noticed) {
            noticed = true;
            new Notice("Custom API failed; using local cache.");
          }
          return local.search(query, translationId, limit);
        }
      },
    };
  }

  private bake(match: SearchMatch, sentence: string, highlight: boolean, abbr: string): string {
    return formatInsert(match, sentence, {
      highlight,
      abbr,
      calloutType: this.bibleVerseCalloutType(),
    });
  }

  private async matchSelection(editor: {
    getSelection: () => string;
    getCursor: (which?: "from" | "to") => { line: number; ch: number };
    replaceRange: (
      t: string,
      from: { line: number; ch: number },
      to: { line: number; ch: number }
    ) => void;
  }): Promise<void> {
    const selection = editor.getSelection();
    if (!selection || !selection.trim()) {
      new Notice("Select some text first.");
      return;
    }

    const from = editor.getCursor("from");
    const sentences = splitSentences(selection);
    if (sentences.length === 0) {
      new Notice("No sentences in the selection.");
      return;
    }

    const { id, abbr } = this.bibleVerseTranslation();
    new Notice(`Matching ${sentences.length} sentence(s) in ${abbr}...`);

    const backend = this.getBackend();
    const selectionStart = { line: from.line, ch: from.ch };
    const ordered = sentences.map((s, i) => ({ ...s, ordinal: i }));
    let aborted = false;

    type Plan = { from: number; to: number; replacement: string | null };
    const plan: Plan[] = [];

    for (const s of ordered) {
      if (aborted) {
        plan.push({ from: s.from, to: s.to, replacement: null });
        continue;
      }

      let result;
      try {
        result = await backend.search(s.text, id, 8);
      } catch (e) {
        new Notice(`HelloAO lookup failed: ${e instanceof Error ? e.message : String(e)}`);
        aborted = true;
        plan.push({ from: s.from, to: s.to, replacement: null });
        continue;
      }

      const kind = decideKind(result.matches);
      const usedAbbr = result.abbr || abbr;
      if (kind === "exact" && result.matches[0]) {
        plan.push({
          from: s.from,
          to: s.to,
          replacement: this.bake(result.matches[0], s.text, this.settings.highlightGist, usedAbbr),
        });
        continue;
      }

      if (kind === "none" || result.matches.length === 0) {
        new Notice(`No scripture match for: ${s.text.slice(0, 48)}...`);
        plan.push({ from: s.from, to: s.to, replacement: null });
        continue;
      }

      const modal = new ScriptureChooserModal(this.app, {
        sentence: s.text,
        matches: result.matches,
        index: s.ordinal + 1,
        total: sentences.length,
        abbr: usedAbbr,
        highlightDefault: this.settings.highlightGist,
      });
      const decision = await modal.choose();
      if (decision.decision === "cancel") {
        aborted = true;
        plan.push({ from: s.from, to: s.to, replacement: null });
        continue;
      }
      if (decision.decision === "skip" || !decision.match) {
        plan.push({ from: s.from, to: s.to, replacement: null });
        continue;
      }
      plan.push({
        from: s.from,
        to: s.to,
        replacement: this.bake(decision.match, s.text, decision.highlight, usedAbbr),
      });
    }

    const posFromOffset = (offset: number) => {
      const before = selection.slice(0, offset);
      const lines = before.split("\n");
      return {
        line: selectionStart.line + lines.length - 1,
        ch:
          lines.length === 1
            ? selectionStart.ch + lines[0].length
            : lines[lines.length - 1].length,
      };
    };

    for (const item of [...plan].sort((a, b) => b.from - a.from)) {
      if (!item.replacement) continue;
      editor.replaceRange(item.replacement, posFromOffset(item.from), posFromOffset(item.to));
    }
  }
}

class VerseMatchSettingTab extends PluginSettingTab {
  plugin: VerseMatchPlugin;

  constructor(app: App, plugin: VerseMatchPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }


  getSettingDefinitions() {
    return [
      {
        name: "Search backend",
        desc: "Local cache is the default. Custom API is a drop-in for a later Worker.",
        control: {
          type: "dropdown" as const,
          key: "backend",
          options: { local: "Local cache", http: "Custom API" },
        },
      },
      {
        name: "Custom API URL",
        desc: "Planned verse search API; leave empty until the host exists.",
        control: {
          type: "text" as const,
          key: "customApiUrl",
          placeholder: "https://verseapi.org",
        },
      },
      {
        name: "Attempt to highlight the relevant portion of the verse",
        desc: "When on, inserts a baked bible code block with ==gist== around the best overlapping span. When off, inserts {John 3:16}.",
        control: {
          type: "toggle" as const,
          key: "highlightGist",
        },
      },
    ];
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Search backend")
      .setDesc("Local cache is the default. Custom API is a drop-in for a later Worker.")
      .addDropdown((d) => {
        d.addOption("local", "Local cache");
        d.addOption("http", "Custom API");
        d.setValue(this.plugin.settings.backend);
        d.onChange(async (v) => {
          this.plugin.settings.backend = v === "http" ? "http" : "local";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Custom API URL")
      .setDesc("Planned verse search API; leave empty until the host exists.")
      .addText((t) => {
        t.setPlaceholder("https://verseapi.org");
        t.setValue(this.plugin.settings.customApiUrl);
        t.onChange(async (v) => {
          this.plugin.settings.customApiUrl = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Attempt to highlight the relevant portion of the verse")
      .setDesc("When on, inserts a baked bible code block with ==gist== around the best overlapping span. When off, inserts {John 3:16}.")
      .addToggle((t) => {
        t.setValue(this.plugin.settings.highlightGist);
        t.onChange(async (v) => {
          this.plugin.settings.highlightGist = v;
          await this.plugin.saveSettings();
        });
      });
  }
}
