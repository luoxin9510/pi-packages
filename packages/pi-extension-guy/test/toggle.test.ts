import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { scanManagedDir } from "../extensions/extension-guy/scan.ts";
import { applyChanges, setItemEnabled } from "../extensions/extension-guy/toggle.ts";

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-extmgr-toggle-"));
});
afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const w = (rel: string, content = "x") => {
	const p = path.join(dir, rel);
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, content);
};
const exists = (rel: string) => fs.existsSync(path.join(dir, rel));

test("disable then enable a single file is identity", () => {
	w("a.ts");
	let item = scanManagedDir(dir, "global", []).find((i) => i.name === "a")!;
	setItemEnabled(item, false);
	assert.equal(exists("a.ts"), false);
	assert.equal(exists("a.ts.disabled"), true);

	item = scanManagedDir(dir, "global", []).find((i) => i.name === "a")!;
	setItemEnabled(item, true);
	assert.equal(exists("a.ts"), true);
	assert.equal(exists("a.ts.disabled"), false);
});

test("index-dir disable renames BOTH index.ts and index.js", () => {
	w("ext/index.ts");
	w("ext/index.js");
	const item = scanManagedDir(dir, "global", []).find((i) => i.name === "ext")!;
	setItemEnabled(item, false);
	assert.equal(exists("ext/index.ts"), false);
	assert.equal(exists("ext/index.js"), false);
	assert.equal(exists("ext/index.ts.disabled"), true);
	assert.equal(exists("ext/index.js.disabled"), true);
});

test("manifest-dir disable renames package.json (+ sibling index)", () => {
	w("m/package.json", JSON.stringify({ pi: { extensions: ["./main.ts"] } }));
	w("m/main.ts");
	w("m/index.ts"); // sibling index must also be disabled to prevent fallthrough
	const item = scanManagedDir(dir, "global", []).find((i) => i.name === "m")!;
	setItemEnabled(item, false);
	assert.equal(exists("m/package.json"), false);
	assert.equal(exists("m/package.json.disabled"), true);
	assert.equal(exists("m/index.ts"), false);
	assert.equal(exists("m/index.ts.disabled"), true);
});

test("precheck: enable fails cleanly when target already exists", () => {
	w("a.ts.disabled");
	w("a.ts"); // collision: both present
	const item = scanManagedDir(dir, "global", []).find((i) => i.name === "a")!;
	// item.enabled is true (a.ts present); ask to enable again -> plan source
	// a.ts.disabled exists, target a.ts exists -> precheck throws.
	assert.throws(() => setItemEnabled(item, true), /already exists/);
});

test("not-togglable item throws", () => {
	w("me.ts");
	const real = fs.realpathSync(path.join(dir, "me.ts"));
	const item = scanManagedDir(dir, "global", [real]).find((i) => i.name === "me")!;
	assert.throws(() => setItemEnabled(item, false), /not togglable/);
});

test("applyChanges collects per-item results without throwing", () => {
	w("a.ts");
	w("b.ts");
	const items = scanManagedDir(dir, "global", []);
	const a = items.find((i) => i.name === "a")!;
	const b = items.find((i) => i.name === "b")!;
	const changes = new Map([
		[a.id, false],
		[b.id, false],
	]);
	const results = applyChanges(items, changes);
	assert.equal(results.length, 2);
	assert.ok(results.every((r) => r.ok));
	assert.equal(exists("a.ts.disabled"), true);
	assert.equal(exists("b.ts.disabled"), true);
});
