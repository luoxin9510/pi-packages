import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchModel, parseModelQuery, parseVerdict } from "../extensions/critic-guy.ts";

const MODELS = [
	{ id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
	{ id: "claude-opus-4-8", name: "Claude Opus 4.8" },
	{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
	{ id: "gpt-4.1", name: "GPT-4.1" },
];

describe("parseModelQuery", () => {
	const cases: Array<[string, string]> = [
		["critic using claude", "claude"],
		["critic model=deepseek", "deepseek"],
		["critic model: gpt-4.1", "gpt-4.1"],
		["critic using 通义", "通义"], // non-ASCII model name
		['critic model="claude"', "claude"], // quoted value
		["critic", ""],
		["", ""],
		// "with" must NOT be parsed as a model spec — it mis-captures filler words
		["critic review auth with the team please", ""],
		["帮忙 critic 一下这段代码", ""],
	];
	for (const [input, expected] of cases) {
		it(`${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
			assert.equal(parseModelQuery(input), expected);
		});
	}
});

describe("matchModel", () => {
	it("returns null for empty query", () => {
		assert.equal(matchModel("", MODELS), null);
	});

	it("matches exact id (case-insensitive)", () => {
		assert.equal(matchModel("CLAUDE-OPUS-4-8", MODELS), "claude-opus-4-8");
	});

	it("matches exact name (case-insensitive)", () => {
		assert.equal(matchModel("deepseek v4 flash", MODELS), "deepseek-v4-flash");
	});

	it("matches partial on id or name", () => {
		assert.equal(matchModel("opus", MODELS), "claude-opus-4-8");
		assert.equal(matchModel("gpt", MODELS), "gpt-4.1");
	});

	it("returns null when nothing matches (no silent substitution)", () => {
		assert.equal(matchModel("nonexistent-model", MODELS), null);
	});

	it("returns null against an empty registry", () => {
		assert.equal(matchModel("claude", []), null);
	});
});

describe("parseVerdict", () => {
	it("returns null for empty output", () => {
		assert.equal(parseVerdict(""), null);
	});

	it("reads PASS from a trailing verdict line", () => {
		assert.equal(parseVerdict("All good here.\nVERDICT: PASS"), "PASS");
	});

	it("reads FAIL", () => {
		assert.equal(parseVerdict("Found a bug.\nVERDICT: FAIL"), "FAIL");
	});

	it("is case-insensitive", () => {
		assert.equal(parseVerdict("verdict: pass"), "PASS");
	});

	it("takes the LAST line-anchored verdict when several appear", () => {
		assert.equal(parseVerdict("VERDICT: PASS\n...revised...\nVERDICT: FAIL"), "FAIL");
	});

	it("returns null when no verdict (timed-out / truncated run)", () => {
		assert.equal(parseVerdict("The code reads two files and..."), null);
	});

	// markdown-wrapped verdicts — very common in LLM output
	it("parses **VERDICT:** PASS (colon inside bold)", () => {
		assert.equal(parseVerdict("**VERDICT:** PASS"), "PASS");
	});

	it("parses fully-bold and backtick-wrapped verdicts", () => {
		assert.equal(parseVerdict("**VERDICT: PASS**"), "PASS");
		assert.equal(parseVerdict("`VERDICT: FAIL`"), "FAIL");
	});

	// trailing punctuation / whitespace variants
	it("tolerates trailing punctuation", () => {
		assert.equal(parseVerdict("VERDICT: PASS."), "PASS");
	});

	it("tolerates whitespace variants (none / multiple / tab)", () => {
		assert.equal(parseVerdict("VERDICT:PASS"), "PASS");
		assert.equal(parseVerdict("VERDICT:   PASS"), "PASS");
		assert.equal(parseVerdict("VERDICT:\tFAIL"), "FAIL");
	});

	it("matches mixed-case spelling", () => {
		assert.equal(parseVerdict("Verdict: Pass"), "PASS");
	});

	// PASSED must NOT match (word boundary)
	it("does not match PASSED (treated as missing)", () => {
		assert.equal(parseVerdict("VERDICT: PASSED"), null);
	});

	// line anchoring: a prose mention must not be read as a verdict
	it("ignores an in-prose (mid-line) mention entirely", () => {
		// Pure mid-line mention with NO real verdict line — isolates line-anchoring:
		// without `^`, this would wrongly return "PASS".
		assert.equal(parseVerdict("see VERDICT: PASS here, not the final word"), null);
		// And a mid-line mention never beats the genuine closing line.
		assert.equal(
			parseVerdict("I won't give VERDICT: PASS unless tests pass.\nVERDICT: FAIL"),
			"FAIL",
		);
	});

	it("a later in-prose mention does not beat the genuine verdict line", () => {
		assert.equal(
			parseVerdict("VERDICT: PASS\nNote: never output VERDICT: FAIL casually."),
			"PASS",
		);
	});

	// colon and value on different lines must NOT be stitched together
	it("does not stitch a verdict across lines", () => {
		assert.equal(parseVerdict("VERDICT:\nPASS"), null);
	});
});
