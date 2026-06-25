/**
 * panel.ts — the interactive overlay listing managed extensions.
 *
 * Pattern adapted from examples/extensions/overlay-test.ts. Pending toggles are
 * in-memory only; nothing touches disk until the user presses enter (apply).
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import type { ManagedItem, Scope } from "./scan.ts";

/** Minimal surface we need from the TUI (avoids a second pi-tui type identity). */
interface RenderHost {
	requestRender(): void;
}

export interface PanelResult {
	/** item.id -> desired enabled state, only for items the user changed. */
	changes: Map<string, boolean>;
}

interface Row {
	type: "header" | "item";
	label?: string; // header text
	item?: ManagedItem;
}

const SCOPE_TITLE: Record<Scope, string> = {
	global: "GLOBAL  (~/.pi/agent/extensions)",
	project: "PROJECT  (.pi/extensions)",
};

export class ExtensionPanel {
	readonly width = 54;
	focused = false;

	private rows: Row[] = [];
	private selected = 0;
	/** pending desired-enabled overrides keyed by item.id */
	private pending = new Map<string, boolean>();

	constructor(
		private readonly items: ManagedItem[],
		private readonly theme: Theme,
		private readonly tui: RenderHost,
		private readonly done: (result: PanelResult | undefined) => void,
	) {
		this.buildRows();
		// Land selection on the first togglable item if any.
		const firstItem = this.rows.findIndex((r) => r.type === "item" && r.item?.togglable);
		if (firstItem >= 0) this.selected = firstItem;
	}

	private buildRows(): void {
		this.rows = [];
		for (const scope of ["global", "project"] as Scope[]) {
			const group = this.items.filter((i) => i.scope === scope);
			if (group.length === 0) continue;
			this.rows.push({ type: "header", label: SCOPE_TITLE[scope] });
			for (const item of group) this.rows.push({ type: "item", item });
		}
	}

	private effectiveEnabled(item: ManagedItem): boolean {
		return this.pending.has(item.id) ? this.pending.get(item.id)! : item.enabled;
	}

	private moveSelection(delta: number): void {
		let i = this.selected;
		for (let step = 0; step < this.rows.length; step++) {
			i = (i + delta + this.rows.length) % this.rows.length;
			if (this.rows[i]?.type === "item") {
				this.selected = i;
				return;
			}
		}
	}

	private toggleSelected(): void {
		const row = this.rows[this.selected];
		if (row?.type !== "item" || !row.item) return;
		const item = row.item;
		if (!item.togglable) return;
		const next = !this.effectiveEnabled(item);
		if (next === item.enabled) {
			this.pending.delete(item.id); // back to original -> no change
		} else {
			this.pending.set(item.id, next);
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "return")) {
			this.done({ changes: new Map(this.pending) });
			return;
		}
		if (matchesKey(data, "up")) {
			this.moveSelection(-1);
		} else if (matchesKey(data, "down")) {
			this.moveSelection(1);
		} else if (data === " ") {
			this.toggleSelected();
		}
		this.tui.requestRender();
	}

	render(_width: number): string[] {
		const th = this.theme;
		const innerW = this.width - 2;
		const lines: string[] = [];

		const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - visibleWidth(s)));
		const row = (content: string) => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");

		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));
		lines.push(row(` ${th.fg("accent", "Extensions")} ${th.fg("dim", "(managed dirs only)")}`));

		if (this.rows.length === 0) {
			lines.push(row(` ${th.fg("dim", "No local extensions found.")}`));
		}

		for (let i = 0; i < this.rows.length; i++) {
			const r = this.rows[i]!;
			if (r.type === "header") {
				lines.push(row(` ${th.fg("dim", `── ${r.label} ──`)}`));
				continue;
			}
			const item = r.item!;
			const isSel = i === this.selected;
			const enabled = this.effectiveEnabled(item);
			const dirty = this.pending.has(item.id);

			let box: string;
			if (!item.togglable) box = th.fg("dim", "[-]");
			else if (enabled) box = th.fg("success", "[x]");
			else box = th.fg("dim", "[ ]");

			const namePlain = item.name;
			const name = !item.togglable
				? th.fg("dim", namePlain)
				: isSel
					? th.fg("accent", namePlain)
					: th.fg("text", namePlain);

			const tagText = item.reason ? `(${item.reason})` : item.shape;
			const tag = th.fg("dim", tagText);
			const star = dirty ? th.fg("warning", "*") : " ";
			const prefix = isSel ? th.fg("accent", " ▶ ") : "   ";

			// name column padded to ~22 visible chars
			const namePad = namePlain + " ".repeat(Math.max(0, 22 - visibleWidth(namePlain)));
			const nameCol = name + namePad.slice(namePlain.length);
			lines.push(row(`${prefix}${box} ${nameCol} ${tag}${star}`));
		}

		lines.push(row(""));
		lines.push(row(` ${th.fg("dim", "↑/↓ move   space toggle")}`));
		lines.push(row(` ${th.fg("dim", "enter apply+reload   esc cancel")}`));
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));
		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}
