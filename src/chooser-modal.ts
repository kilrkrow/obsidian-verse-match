import { Modal, Setting } from "obsidian";
import type { App } from "obsidian";
import type { SearchMatch } from "./search-backend";

export type ChooserDecision = "insert" | "skip" | "cancel";

export interface ChooserResult {
  decision: ChooserDecision;
  match: SearchMatch | null;
  highlight: boolean;
}

export class ScriptureChooserModal extends Modal {
  private readonly sentence: string;
  private readonly matches: SearchMatch[];
  private readonly index: number;
  private readonly total: number;
  private readonly abbr: string;
  private highlight: boolean;
  private selected = 0;
  private resolve!: (r: ChooserResult) => void;
  private done = false;

  constructor(
    app: App,
    args: {
      sentence: string;
      matches: SearchMatch[];
      index: number;
      total: number;
      abbr: string;
      highlightDefault: boolean;
    }
  ) {
    super(app);
    this.sentence = args.sentence;
    this.matches = args.matches;
    this.index = args.index;
    this.total = args.total;
    this.abbr = args.abbr;
    this.highlight = args.highlightDefault;
  }

  choose(): Promise<ChooserResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  onOpen(): void {
    this.modalEl.addClass("verse-match-modal");
    this.titleEl.setText(`Choose scripture (${this.index}/${this.total})`);
    const { contentEl } = this;
    contentEl.empty();

    contentEl.createDiv({ cls: "verse-match-kicker", text: "SELECTED" });
    contentEl.createDiv({ cls: "verse-match-selected", text: this.sentence });

    contentEl.createDiv({ cls: "verse-match-kicker", text: "CANDIDATES" });
    const list = contentEl.createDiv({ cls: "verse-match-candidates" });

    const renderList = () => {
      list.empty();
      this.matches.forEach((m, i) => {
        const row = list.createDiv({
          cls: "verse-match-row" + (i === this.selected ? " is-selected" : ""),
        });
        const ref = row.createDiv({ cls: "verse-match-ref" });
        ref.setText(`${m.book} ${m.chapter}:${m.verse} ${this.abbr}`);
        row.createDiv({
          cls: "verse-match-text",
          text: `"${m.text.replace(/^[\u00b6\s]+/, "")}"`,
        });
        row.onclick = () => {
          this.selected = i;
          renderList();
          refreshInsert();
        };
        row.ondblclick = () => this.finish("insert");
      });
    };

    new Setting(contentEl)
      .setClass("verse-match-highlight")
      .setName("Highlight relevant portion")
      .addToggle((t) => {
        t.setValue(this.highlight);
        t.onChange((v) => {
          this.highlight = v;
        });
      });

    const footer = contentEl.createDiv({ cls: "verse-match-footer" });
    const left = footer.createDiv();
    const right = footer.createDiv({ cls: "verse-match-footer-right" });

    new Setting(left).addButton((btn) => {
      btn.setButtonText("Cancel").onClick(() => this.finish("cancel"));
    });
    new Setting(right).addButton((btn) => {
      btn.setButtonText("Skip").onClick(() => this.finish("skip"));
    });
    let insertBtn: HTMLButtonElement | null = null;
    const refreshInsert = () => {
      const m = this.matches[this.selected];
      const label = m ? `Insert ${m.token}` : "Insert";
      if (insertBtn) insertBtn.textContent = label;
    };
    new Setting(right).addButton((btn) => {
      btn.setCta();
      const m = this.matches[this.selected];
      btn.setButtonText(m ? `Insert ${m.token}` : "Insert");
      insertBtn = btn.buttonEl;
      btn.onClick(() => this.finish("insert"));
    });

    renderList();

    this.scope.register([], "ArrowDown", (e) => {
      e.preventDefault();
      this.selected = Math.min(this.selected + 1, this.matches.length - 1);
      renderList();
      refreshInsert();
    });
    this.scope.register([], "ArrowUp", (e) => {
      e.preventDefault();
      this.selected = Math.max(this.selected - 1, 0);
      renderList();
      refreshInsert();
    });
    this.scope.register([], "Enter", (e) => {
      e.preventDefault();
      this.finish("insert");
    });
  }

  onClose(): void {
    if (!this.done) this.finish("cancel");
    this.contentEl.empty();
  }

  private finish(decision: ChooserDecision): void {
    if (this.done) return;
    this.done = true;
    const match = decision === "insert" ? this.matches[this.selected] ?? null : null;
    this.close();
    this.resolve({ decision, match, highlight: this.highlight });
  }
}
