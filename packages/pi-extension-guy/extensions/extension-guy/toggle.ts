/**
 * toggle.ts — apply enable/disable by renaming files on disk.
 *
 * - Re-reads current on-disk state right before renaming (precheck) so a
 *   concurrently-modified entry produces a clean per-item error, not a crash.
 * - Renames within ONE item are rolled back if a later rename in that item
 *   fails, so an index-dir is never left half-renamed (spec §5 / Critic).
 */

import * as fs from "node:fs";
import type { ManagedItem } from "./scan.ts";

export interface ApplyResult {
	item: ManagedItem;
	ok: boolean;
	error?: string;
}

/** Pairs of [from, to] needed to reach `targetEnabled` for one item. */
function planRenames(item: ManagedItem, targetEnabled: boolean): Array<{ from: string; to: string }> {
	const plan: Array<{ from: string; to: string }> = [];
	for (const unit of item.units) {
		const from = targetEnabled ? unit.disabledPath : unit.enabledPath;
		const to = targetEnabled ? unit.enabledPath : unit.disabledPath;
		// Only rename units whose source currently exists and whose target does not.
		if (fs.existsSync(from)) {
			plan.push({ from, to });
		}
	}
	return plan;
}

/** Precheck a plan; throws on collision/missing so we abort before any rename. */
function precheck(plan: Array<{ from: string; to: string }>): void {
	for (const { from, to } of plan) {
		if (!fs.existsSync(from)) {
			throw new Error(`source vanished: ${from}`);
		}
		if (fs.existsSync(to)) {
			throw new Error(`target already exists: ${to}`);
		}
	}
}

/**
 * Toggle one item to `targetEnabled`. Atomic-per-item with rollback.
 * Returns nothing; throws on failure (caller collects).
 */
export function setItemEnabled(item: ManagedItem, targetEnabled: boolean): void {
	if (!item.togglable) {
		throw new Error(`not togglable (${item.reason ?? "locked"})`);
	}
	const plan = planRenames(item, targetEnabled);
	if (plan.length === 0) {
		// Already in desired state (or nothing to do).
		return;
	}
	precheck(plan);

	const done: Array<{ from: string; to: string }> = [];
	try {
		for (const step of plan) {
			fs.renameSync(step.from, step.to);
			done.push(step);
		}
	} catch (err) {
		// Roll back already-applied renames in reverse.
		for (let i = done.length - 1; i >= 0; i--) {
			const step = done[i]!;
			try {
				fs.renameSync(step.to, step.from);
			} catch {
				// Best-effort rollback; surface original error below.
			}
		}
		throw err instanceof Error ? err : new Error(String(err));
	}
}

/**
 * Apply a batch of desired states. Never throws; returns per-item results.
 * `changes` maps item.id -> desired enabled state (only items that changed).
 */
export function applyChanges(items: ManagedItem[], changes: Map<string, boolean>): ApplyResult[] {
	const results: ApplyResult[] = [];
	for (const item of items) {
		if (!changes.has(item.id)) continue;
		const target = changes.get(item.id)!;
		try {
			setItemEnabled(item, target);
			results.push({ item, ok: true });
		} catch (err) {
			results.push({ item, ok: false, error: err instanceof Error ? err.message : String(err) });
		}
	}
	return results;
}
