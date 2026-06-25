/**
 * pi-extension-manager — list local extensions and hot enable/disable them.
 *
 * Disable works by renaming a file so the loader no longer discovers it
 * (foo.ts -> foo.ts.disabled), then ctx.reload() re-discovers everything.
 *
 * IMPORTANT: apply + reload run ONLY in the /extensions command path, because
 * reload() exists only on ExtensionCommandContext (not the ExtensionContext a
 * shortcut handler receives). See spec §4/§5.
 */

import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { type ManagedItem, scanManagedDir } from "./scan.ts";
import { applyChanges } from "./toggle.ts";
import { ExtensionPanel, type PanelResult } from "./panel.ts";

function realOrSelf(p: string): string {
	try {
		return fs.realpathSync(p);
	} catch {
		return p;
	}
}

/** realpaths identifying this manager (file + containing dir) for self-guard. */
function selfRealPaths(): string[] {
	const here = realOrSelf(fileURLToPath(import.meta.url));
	const set = new Set<string>([here, realOrSelf(path.dirname(here))]);
	// Also guard the package root (one level up from src/dist).
	set.add(realOrSelf(path.dirname(path.dirname(here))));
	return [...set];
}

function managedDirs(cwd: string): Array<{ dir: string; scope: "global" | "project" }> {
	const globalDir = path.join(os.homedir(), ".pi", "agent", "extensions");
	const projectDir = path.join(cwd, ".pi", "extensions");
	return [
		{ dir: globalDir, scope: "global" },
		{ dir: projectDir, scope: "project" },
	];
}

function scanAll(cwd: string): ManagedItem[] {
	const selves = selfRealPaths();
	const items: ManagedItem[] = [];
	for (const { dir, scope } of managedDirs(cwd)) {
		items.push(...scanManagedDir(dir, scope, selves));
	}
	return items;
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("extensions", {
		description: "List local extensions; hot enable/disable them",
		handler: async (_args: string, ctx: ExtensionCommandContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("extensions panel requires interactive mode", "error");
				return;
			}

			const items = scanAll(ctx.cwd);

			// Show the panel and collect pending changes.
			const result = await ctx.ui.custom<PanelResult | undefined>(
				(tui, theme, _kb, done) => new ExtensionPanel(items, theme, tui, done),
				{ overlay: true },
			);

			// Cancelled or no changes.
			if (!result || result.changes.size === 0) {
				return;
			}

			// 1. All disk renames first (pure fs, no ctx use after this for state).
			const applied = applyChanges(items, result.changes);
			const okCount = applied.filter((r) => r.ok).length;
			const errs = applied.filter((r) => !r.ok);

			// 2. Nothing applied -> report, no reload.
			if (okCount === 0) {
				ctx.ui.notify(
					errs.length ? `All toggles failed: ${errs[0]!.error}` : "No changes applied",
					"warning",
				);
				return;
			}

			// 3. Report BEFORE reload (last safe ctx use for messaging).
			const errNote = errs.length ? ` (${errs.length} failed)` : "";
			ctx.ui.notify(`Applied ${okCount} change(s)${errNote}; reloading…`, "info");

			// 4. Reload is terminal for this handler. Do NOT touch ctx afterwards.
			await ctx.reload();
			return;
		},
	});

	// Optional shortcut: opens the panel via the command path only (its ctx has
	// no reload()). Off by default — uncomment to enable.
	// pi.registerShortcut("ctrl+e", {
	//   description: "Open extension manager",
	//   handler: () => pi.sendUserMessage("/extensions"),
	// });
}
