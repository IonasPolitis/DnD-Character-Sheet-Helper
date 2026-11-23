import { App, MarkdownRenderChild, Modal, Notice } from 'obsidian';
import type DnDCharacterSheetHelperPlugin from '../../main';
import { formatFeatureOrSlug, serializeHitDiceState } from '../helpers';

// --- SHORT REST MODAL UI ---
export interface ShortRestModalOptions {
    maxHealth: number;
    currentHealth: number;
    hitDiceStr: string;
    level: number;
    spentHitDice: number;
    targetCurrentHpKey: string;
    targetHitDiceKey: string;
    onHealAboveZero?: () => void;
}

export class ShortRestModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    sourcePath: string;
    options: ShortRestModalOptions;
    dieSize: number;
    conMod: number = 0;
    rollLogs: string[] = [];

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, sourcePath: string, options: ShortRestModalOptions) {
        super(app);
        this.plugin = plugin;
        this.sourcePath = sourcePath;
        this.options = { ...options };
        const parsedDie = parseInt(String(options.hitDiceStr || "d8").replace(/\D/g, ""), 10);
        this.dieSize = !isNaN(parsedDie) && parsedDie > 0 ? parsedDie : 8;
    }

    onOpen() {
        const fileCache = this.app.metadataCache.getCache(this.sourcePath);
        const frontmatter: Record<string, any> = fileCache?.frontmatter || {};
        const conScore = Number(frontmatter["DnD_constitution"]);
        this.conMod = !isNaN(conScore) && conScore > 0 ? Math.floor((conScore - 10) / 2) : 0;
        this.renderModal();
    }

    renderModal() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("dnd-modal");

        contentEl.createEl("h3", { text: "⛺ Short Rest", cls: "dnd-modal-title" });
        contentEl.createEl("p", {
            text: "Spend Hit Dice to recover Hit Points, then finish your Short Rest to restore Short Rest features.",
            cls: "dnd-modal-subtitle"
        });

        const remainingHd = Math.max(0, this.options.level - this.options.spentHitDice);
        const conModStr = `${this.conMod >= 0 ? "+" : ""}${this.conMod}`;

        // 1. Live Status Summary Card
        const statusCard = contentEl.createDiv({ cls: "dnd-short-rest-status-card" });

        const hpCol = statusCard.createDiv({ cls: "dnd-short-rest-stat" });
        hpCol.createEl("span", { text: "HIT POINTS", cls: "dnd-short-rest-stat-label" });
        hpCol.createEl("span", {
            text: `${this.options.currentHealth} / ${this.options.maxHealth}`,
            cls: "dnd-short-rest-stat-val"
        });

        const hdCol = statusCard.createDiv({ cls: "dnd-short-rest-stat" });
        hdCol.createEl("span", { text: `HIT DICE (D${this.dieSize})`, cls: "dnd-short-rest-stat-label" });
        hdCol.createEl("span", {
            text: `${remainingHd} / ${this.options.level} left`,
            cls: "dnd-short-rest-stat-val"
        });

        const conCol = statusCard.createDiv({ cls: "dnd-short-rest-stat" });
        conCol.createEl("span", { text: "CON MODIFIER", cls: "dnd-short-rest-stat-label" });
        conCol.createEl("span", {
            text: conModStr,
            cls: "dnd-short-rest-stat-val"
        });

        // 2. Spend Hit Dice Controls (Physical Die Roll Input)
        const spendCard = contentEl.createDiv({ cls: "dnd-form-card dnd-short-rest-actions" });
        const canSpend = remainingHd > 0 && this.options.currentHealth < this.options.maxHealth;

        const manualRow = spendCard.createDiv({ cls: "dnd-short-rest-manual-row" });
        manualRow.createEl("span", {
            text: `Enter your d${this.dieSize} roll:`,
            cls: "dnd-short-rest-manual-label"
        });

        const manualInput = manualRow.createEl("input", {
            type: "number",
            value: String(Math.ceil(this.dieSize / 2) + 1),
            cls: "dnd-health-input dnd-short-rest-manual-input",
            attr: { min: "1", max: String(this.dieSize) }
        });

        const manualBtn = manualRow.createEl("button", {
            text: `Spend Hit Die (${conModStr} CON)`,
            cls: "dnd-health-btn dnd-health-btn-heal"
        });
        if (!canSpend) {
            manualInput.disabled = true;
            manualBtn.disabled = true;
            manualBtn.title = remainingHd <= 0 ? "No Hit Dice remaining" : "Already at Maximum HP";
        }
        manualBtn.onclick = async () => {
            if (!canSpend) return;
            const rawVal = Math.floor(Number(manualInput.value) || 0);
            if (rawVal < 1 || rawVal > this.dieSize) {
                new Notice(`Please enter a roll between 1 and ${this.dieSize}.`);
                return;
            }
            await this.applyHitDieHeal(rawVal);
        };

        // 3. Roll Log (if any dice spent during this rest)
        if (this.rollLogs.length > 0) {
            const logBox = contentEl.createDiv({ cls: "dnd-short-rest-log" });
            for (const entry of this.rollLogs) {
                logBox.createDiv({ text: entry, cls: "dnd-short-rest-log-item" });
            }
        }

        // 4. Footer: Close / Finish Short Rest
        const footer = contentEl.createDiv({ cls: "dnd-short-rest-footer" });
        const cancelBtn = footer.createEl("button", { text: "Close" });
        cancelBtn.onclick = () => this.close();

        const finishBtn = footer.createEl("button", {
            text: "Finish Short Rest",
            cls: "mod-cta"
        });
        finishBtn.onclick = async () => {
            await this.plugin.resetCharacterRestState(this.sourcePath, "short");
            window.dispatchEvent(new Event("short-rest"));
            new Notice("Short Rest completed! Short Rest feature uses restored.");
            this.close();
        };
    }

    async applyHitDieHeal(dieRoll: number) {
        const healAmount = Math.max(1, dieRoll + this.conMod);
        const oldHp = this.options.currentHealth;
        const newHp = Math.min(this.options.maxHealth, oldHp + healAmount);
        const newSpent = Math.min(this.options.level, this.options.spentHitDice + 1);

        this.options.currentHealth = newHp;
        this.options.spentHitDice = newSpent;

        const conStr = `${this.conMod >= 0 ? "+" : ""}${this.conMod}`;
        this.rollLogs.push(`🎲 Rolled d${this.dieSize} (${dieRoll}) ${conStr} CON = +${healAmount} HP (${oldHp} → ${newHp} HP)`);

        const updates: Record<string, any> = {
            [this.options.targetCurrentHpKey]: newHp,
            [this.options.targetHitDiceKey]: serializeHitDiceState(this.options.hitDiceStr, newSpent)
        };
        if (oldHp <= 0 && newHp > 0 && this.options.onHealAboveZero) {
            this.options.onHealAboveZero();
        }

        await this.plugin.updateCharacterFrontmatter(this.sourcePath, updates);
        this.renderModal();
    }

    onClose() {
        this.contentEl.empty();
    }
}

// --- THE POP-UP UI ---
export class NoteModal extends Modal {
    plugin: DnDCharacterSheetHelperPlugin;
    noteKey: string;
    renderChild!: MarkdownRenderChild;

    constructor(app: App, plugin: DnDCharacterSheetHelperPlugin, noteKey: string) {
        super(app);
        this.plugin = plugin;
        this.noteKey = noteKey;
    }

    async onOpen() {
        const { contentEl, titleEl } = this;
        this.renderChild = new MarkdownRenderChild(contentEl);
        this.renderChild.load();

        const formattedTitle = formatFeatureOrSlug(this.noteKey);
        titleEl.setText(formattedTitle);

        const fileContent = await this.plugin.getMarkdownNoteContent(this.noteKey);

        if (fileContent) {
            await this.plugin.renderDndMarkdown(fileContent, contentEl, "", this.renderChild);
        } else {
            contentEl.createEl("p", {
                text: `Error: Could not find "${this.noteKey}" in the bundled Markdown registry or Custom Rulebook.`,
                cls: "dnd-error-text"
            });
        }
    }

    onClose() {
        if (this.renderChild) this.renderChild.unload();
        this.contentEl.empty();
    }
}

// --- CUSTOM NOTIFICATION UI ---
export class DnDCustomNotice extends Notice {
    constructor(
        title: string,
        message: string,
        iconString: string = "🎲",
        primaryAction?: { text: string; callback: () => void },
        secondaryAction?: { text: string; callback: () => void },
        duration: number = 0
    ) {
        super("", duration);

        const rootEl = (this.noticeEl.closest(".notice") as HTMLElement) || this.noticeEl;
        rootEl.empty();
        rootEl.addClass("dnd-custom-notice");
        rootEl.onclick = (e) => e.stopPropagation();

        const layout = rootEl.createDiv({ cls: "dnd-notice-layout" });

        const iconBox = layout.createDiv({ cls: "dnd-notice-icon" });
        iconBox.innerText = iconString;

        const contentCol = layout.createDiv({ cls: "dnd-notice-content" });
        const headerRow = contentCol.createDiv({ cls: "dnd-notice-header" });

        headerRow.createEl("div", { text: title, cls: "dnd-notice-title" });

        const closeBtn = headerRow.createEl("button", {
            text: "✕",
            cls: "dnd-notice-close",
            attr: { title: "Dismiss" }
        });
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            this.hide();
        };

        contentCol.createEl("div", { text: message, cls: "dnd-notice-message" });

        if (primaryAction || secondaryAction) {
            const btnRow = contentCol.createDiv({ cls: "dnd-notice-buttons" });

            if (primaryAction) {
                const pBtn = btnRow.createEl("button", {
                    text: primaryAction.text,
                    cls: "mod-cta dnd-notice-btn-primary"
                });
                pBtn.onclick = (e) => {
                    e.stopPropagation();
                    primaryAction.callback();
                    this.hide();
                };
            }

            if (secondaryAction) {
                const sBtn = btnRow.createEl("button", {
                    text: secondaryAction.text,
                    cls: "dnd-notice-btn-secondary"
                });
                sBtn.onclick = (e) => {
                    e.stopPropagation();
                    secondaryAction.callback();
                    this.hide();
                };
            }
        }
    }
}
