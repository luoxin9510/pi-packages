/**
 * scan.ts — discover & classify local extensions in the managed dirs.
 *
 * Replicates pi's loader discovery rules (isExtensionFile /
 * resolveExtensionEntries) so the panel's enabled/disabled state mirrors what
 * the loader would actually do. See spec §3 / §5.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export type Scope = "global" | "project";
export type Shape = "file" | "index-dir" | "manifest-dir";

/** A single on-disk rename target: the path when enabled vs when disabled. */
export interface RenameUnit {
	/** Absolute path that exists when the entry is ENABLED. */
	enabledPath: string;
	/** Absolute path that exists when the entry is DISABLED. */
	disabledPath: string;
}

export interface ManagedItem {
	id: string; // `${scope}:${relativeName}`
	name: string; // display name
	scope: Scope;
	shape: Shape;
	enabled: boolean; // derived to mirror the loader
	togglable: boolean; // false for self / symlink-escape / unloadable
	reason?: string; // tag shown when not togglable
	/** Rename units applied on toggle (disable = enabled->disabled, enable = reverse). */
	units: RenameUnit[];
}

const DISABLED_SUFFIX = ".disabled";

function isExtensionFile(name: string): boolean {
	return name.endsWith(".ts") || name.endsWith(".js");
}

function isDisabledExtensionFile(name: string): boolean {
	return name.endsWith(`.ts${DISABLED_SUFFIX}`) || name.endsWith(`.js${DISABLED_SUFFIX}`);
}

/** Strip a trailing ".disabled" if present. */
function stripDisabled(name: string): string {
	return name.endsWith(DISABLED_SUFFIX) ? name.slice(0, -DISABLED_SUFFIX.length) : name;
}

function safeRealpath(p: string): string | undefined {
	try {
		return fs.realpathSync(p);
	} catch {
		return undefined;
	}
}

/** Does `child`'s realpath stay inside `parent`? (parent assumed already real) */
function isInside(parentReal: string, childReal: string): boolean {
	const rel = path.relative(parentReal, childReal);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

interface ManifestInfo {
	/** package.json (or .disabled) names present. */
	pkgPath?: string;
	pkgDisabledPath?: string;
	/** Entry paths declared in pi.extensions that currently exist on disk. */
	resolvedEntries: string[];
	/** Whether a (non-disabled) package.json with a pi.extensions array exists. */
	hasManifest: boolean;
}

function readManifest(dir: string): ManifestInfo {
	const pkgPath = path.join(dir, "package.json");
	const pkgDisabledPath = path.join(dir, `package.json${DISABLED_SUFFIX}`);
	const info: ManifestInfo = { resolvedEntries: [], hasManifest: false };
	if (fs.existsSync(pkgDisabledPath)) info.pkgDisabledPath = pkgDisabledPath;
	if (!fs.existsSync(pkgPath)) return info;
	info.pkgPath = pkgPath;
	try {
		const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
		const exts: unknown = pkg?.pi?.extensions;
		if (Array.isArray(exts)) {
			info.hasManifest = true;
			for (const e of exts) {
				if (typeof e !== "string") continue;
				const abs = path.resolve(dir, e);
				if (fs.existsSync(abs)) info.resolvedEntries.push(abs);
			}
		}
	} catch {
		// malformed package.json -> treat as no manifest
	}
	return info;
}

/** Index files (index.ts/index.js) present, enabled or disabled. */
function indexUnits(dir: string): { units: RenameUnit[]; anyEnabled: boolean } {
	const units: RenameUnit[] = [];
	let anyEnabled = false;
	for (const base of ["index.ts", "index.js"]) {
		const enabledPath = path.join(dir, base);
		const disabledPath = path.join(dir, base + DISABLED_SUFFIX);
		const hasEnabled = fs.existsSync(enabledPath);
		const hasDisabled = fs.existsSync(disabledPath);
		if (hasEnabled || hasDisabled) {
			units.push({ enabledPath, disabledPath });
			if (hasEnabled) anyEnabled = true;
		}
	}
	return { units, anyEnabled };
}

/**
 * Scan one managed dir into ManagedItem[].
 *
 * @param dir absolute path to a managed extensions dir
 * @param scope "global" | "project"
 * @param selfRealPaths realpaths identifying the manager itself (file + dir)
 */
export function scanManagedDir(dir: string, scope: Scope, selfRealPaths: string[]): ManagedItem[] {
	const items: ManagedItem[] = [];
	if (!fs.existsSync(dir)) return items;
	const dirReal = safeRealpath(dir) ?? dir;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return items;
	}

	const isSelf = (p: string): boolean => {
		const real = safeRealpath(p);
		if (!real) return false;
		return selfRealPaths.includes(real);
	};

	for (const entry of entries) {
		const entryPath = path.join(dir, entry.name);
		const isLink = entry.isSymbolicLink();

		// Symlink whose realpath escapes the managed dir -> read-only.
		if (isLink) {
			const real = safeRealpath(entryPath);
			if (!real || !isInside(dirReal, real)) {
				const isDirLink = !!real && fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory();
				// Only surface symlinks that look like extensions.
				const looksExt = isExtensionFile(entry.name) || isDisabledExtensionFile(entry.name) || isDirLink;
				if (!looksExt) continue;
				items.push({
					id: `${scope}:${entry.name}`,
					name: isDirLink ? entry.name : stripDisabled(entry.name).replace(/\.(ts|js)$/, ""),
					scope,
					shape: isDirLink ? "index-dir" : "file",
					// A dir symlink that resolves is loaded; a file symlink is enabled iff its name is .ts/.js.
					enabled: isDirLink ? true : isExtensionFile(entry.name),
					togglable: false,
					reason: "symlink",
					units: [],
				});
				continue;
			}
		}

		// --- Single file ---
		if (entry.isFile() && (isExtensionFile(entry.name) || isDisabledExtensionFile(entry.name))) {
			const enabledName = stripDisabled(entry.name);
			const enabledPath = path.join(dir, enabledName);
			const disabledPath = path.join(dir, enabledName + DISABLED_SUFFIX);
			const enabled = !entry.name.endsWith(DISABLED_SUFFIX);
			items.push({
				id: `${scope}:${enabledName}`,
				name: enabledName.replace(/\.(ts|js)$/, ""),
				scope,
				shape: "file",
				enabled,
				togglable: !isSelf(entryPath),
				reason: isSelf(entryPath) ? "self" : undefined,
				units: [{ enabledPath, disabledPath }],
			});
			continue;
		}

		// --- Directory (or symlink-to-dir that stays inside) ---
		const isDir = entry.isDirectory() || (isLink && fs.existsSync(entryPath) && fs.statSync(entryPath).isDirectory());
		if (!isDir) continue;

		const manifest = readManifest(entryPath);
		const idx = indexUnits(entryPath);

		// Manifest dir: package.json (or .disabled) drives loading.
		if (manifest.hasManifest || manifest.pkgDisabledPath) {
			const pkgEnabled = path.join(entryPath, "package.json");
			const pkgDisabled = path.join(entryPath, `package.json${DISABLED_SUFFIX}`);
			// units: package.json first, then any index files (to prevent fallthrough).
			const units: RenameUnit[] = [{ enabledPath: pkgEnabled, disabledPath: pkgDisabled }, ...idx.units];

			// enabled iff a live package.json resolves >=1 existing entry,
			// OR (manifest absent/empty but index present) -> index would load.
			const manifestLoads = manifest.hasManifest && manifest.resolvedEntries.length > 0;
			const enabled = manifestLoads || (!manifest.pkgPath && idx.anyEnabled);

			// Unloadable: package.json present but no valid entries and no index.
			const unloadable = !!manifest.pkgPath && !manifestLoads && idx.units.length === 0;

			const self = isSelf(entryPath);
			items.push({
				id: `${scope}:${entry.name}`,
				name: entry.name,
				scope,
				shape: "manifest-dir",
				enabled,
				togglable: !self && !unloadable,
				reason: self ? "self" : unloadable ? "unloadable" : undefined,
				units,
			});
			continue;
		}

		// Index dir: index.ts and/or index.js.
		if (idx.units.length > 0) {
			const self = isSelf(entryPath);
			items.push({
				id: `${scope}:${entry.name}`,
				name: entry.name,
				scope,
				shape: "index-dir",
				enabled: idx.anyEnabled,
				togglable: !self,
				reason: self ? "self" : undefined,
				units: idx.units,
			});
			continue;
		}

		// Otherwise: not an extension dir, ignore.
	}

	// Stable order: enabled first within togglable, then by name.
	items.sort((a, b) => a.name.localeCompare(b.name));
	return items;
}
