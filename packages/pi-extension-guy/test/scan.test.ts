import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { scanManagedDir } from "../extensions/extension-guy/scan.ts";

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-extmgr-scan-"));
});
afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const w = (rel: string, content = "x") => {
	const p = path.join(dir, rel);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, content);
};

test("single file: enabled and disabled", () => {
	w("a.ts");
	w("b.ts.disabled");
	const items = scanManagedDir(dir, "global", []);
	const a = items.find((i) => i.name === "a")!;
	const b = items.find((i) => i.name === "b")!;
	assert.equal(a.shape, "file");
	assert.equal(a.enabled, true);
	assert.equal(a.togglable, true);
	assert.equal(b.enabled, false);
});

test("ignores non-extension files", () => {
	w("readme.md");
	w("notes.txt");
	const items = scanManagedDir(dir, "global", []);
	assert.equal(items.length, 0);
});

test("index-dir: both index.ts and index.js tracked; any enabled => enabled", () => {
	w("ext/index.ts");
	w("ext/index.js");
	const items = scanManagedDir(dir, "global", []);
	const ext = items.find((i) => i.name === "ext")!;
	assert.equal(ext.shape, "index-dir");
	assert.equal(ext.enabled, true);
	assert.equal(ext.units.length, 2);
});

test("index-dir disabled when only .disabled variants present", () => {
	w("ext/index.ts.disabled");
	const items = scanManagedDir(dir, "global", []);
	const ext = items.find((i) => i.name === "ext")!;
	assert.equal(ext.enabled, false);
	assert.equal(ext.togglable, true);
});

test("manifest-dir enabled when pi.extensions resolves an existing file", () => {
	w("m/package.json", JSON.stringify({ pi: { extensions: ["./main.ts"] } }));
	w("m/main.ts");
	const items = scanManagedDir(dir, "global", []);
	const m = items.find((i) => i.name === "m")!;
	assert.equal(m.shape, "manifest-dir");
	assert.equal(m.enabled, true);
	assert.equal(m.togglable, true);
	// package.json is the first rename unit.
	assert.ok(m.units[0]!.enabledPath.endsWith("package.json"));
});

test("manifest-dir unloadable: entries point nowhere and no index", () => {
	w("m/package.json", JSON.stringify({ pi: { extensions: ["./missing.ts"] } }));
	const items = scanManagedDir(dir, "global", []);
	const m = items.find((i) => i.name === "m")!;
	assert.equal(m.enabled, false);
	assert.equal(m.togglable, false);
	assert.equal(m.reason, "unloadable");
});

test("dir with package.json but no pi.extensions falls back to index-dir", () => {
	w("m/package.json", JSON.stringify({ name: "x" }));
	w("m/index.ts");
	const items = scanManagedDir(dir, "global", []);
	const m = items.find((i) => i.name === "m")!;
	assert.equal(m.shape, "index-dir");
	assert.equal(m.enabled, true);
});

test("self is detected and locked", () => {
	w("me.ts");
	const real = fs.realpathSync(path.join(dir, "me.ts"));
	const items = scanManagedDir(dir, "global", [real]);
	const me = items.find((i) => i.name === "me")!;
	assert.equal(me.togglable, false);
	assert.equal(me.reason, "self");
});
