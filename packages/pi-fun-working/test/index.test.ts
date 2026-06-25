import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { effectiveChance, fillTemplate, hslToRgb } from "../extensions/fun-working/index.ts";

describe("fillTemplate", () => {
	it("replaces a single placeholder", () => {
		assert.equal(fillTemplate("GOOOAL! {tool}", { tool: "bash" }), "GOOOAL! bash");
	});

	it("replaces every occurrence of the same key", () => {
		assert.equal(fillTemplate("{x}-{x}", { x: "ok" }), "ok-ok");
	});

	it("replaces multiple distinct keys", () => {
		assert.equal(fillTemplate("turn {turn} in {ms}ms", { turn: 3, ms: 120 }), "turn 3 in 120ms");
	});

	it("coerces numbers to strings", () => {
		assert.equal(fillTemplate("Combo x{turn}", { turn: 7 }), "Combo x7");
	});

	it("leaves unknown placeholders untouched", () => {
		assert.equal(fillTemplate("hi {missing}", { tool: "x" }), "hi {missing}");
	});

	it("is a no-op when there are no vars", () => {
		assert.equal(fillTemplate("It's coming home", {}), "It's coming home");
	});
});

describe("effectiveChance", () => {
	it("multiplies base by multiplier", () => {
		assert.equal(effectiveChance(0.8, 1), 0.8);
		assert.equal(effectiveChance(0.5, 0.5), 0.25);
	});

	it("clamps above 1", () => {
		assert.equal(effectiveChance(0.95, 2), 1);
	});

	it("clamps below 0", () => {
		assert.equal(effectiveChance(0.5, -3), 0);
	});

	it("falls back to 1 for non-finite inputs", () => {
		assert.equal(effectiveChance(Number.NaN, 1), 1);
		// non-finite multiplier falls back to 1, so 0.5 * 1 = 0.5
		assert.equal(effectiveChance(0.5, Number.POSITIVE_INFINITY), 0.5);
	});

	it("a zero multiplier silences everything", () => {
		assert.equal(effectiveChance(1, 0), 0);
	});
});

describe("hslToRgb", () => {
	it("maps pure red", () => {
		assert.deepEqual(hslToRgb(0, 1, 0.5), [255, 0, 0]);
	});

	it("maps pure green", () => {
		assert.deepEqual(hslToRgb(1 / 3, 1, 0.5), [0, 255, 0]);
	});

	it("maps pure blue", () => {
		assert.deepEqual(hslToRgb(2 / 3, 1, 0.5), [0, 0, 255]);
	});

	it("maps white (full lightness) and black (zero lightness)", () => {
		assert.deepEqual(hslToRgb(0, 0, 1), [255, 255, 255]);
		assert.deepEqual(hslToRgb(0, 0, 0), [0, 0, 0]);
	});

	it("stays within channel bounds across the hue wheel", () => {
		for (let i = 0; i <= 12; i++) {
			const rgb = hslToRgb(i / 12, 0.9, 0.65);
			for (const c of rgb) {
				assert.ok(c >= 0 && c <= 255, `channel ${c} out of range`);
			}
		}
	});
});
