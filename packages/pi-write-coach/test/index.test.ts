import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ALLOWLIST,
  countLines,
  createSizeGuard,
  guidance,
  isAllowlistedPath,
  isGuardedModelKey,
  MAX_CHARS,
  MAX_LINES,
  measureEdits,
  RELEASE_AFTER_BLOCKS,
} from "../extensions/core.ts";

// ─── countLines ───────────────────────────────────────────────────────────

describe("countLines", () => {
  const cases: Array<[string, number]> = [
    ["", 0],
    ["a", 1],
    ["a\nb", 2],
    ["a\n", 2],      // trailing newline -> empty last line
    ["a\r\nb", 2],   // CRLF: only \n counted
    ["\n\n\n", 4],
    ["line1\nline2\nline3", 3],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(countLines(input), expected);
    });
  }
});

// ─── isGuardedModelKey ────────────────────────────────────────────────────

describe("isGuardedModelKey", () => {
  const cases: Array<[string, boolean]> = [
    ["anthropic/claude-opus-4-8", true],
    ["anthropic/claude-sonnet-4-6", true],
    ["deepseek/deepseek-v4", true],
    ["DEEPSEEK/DeepSeek-V4", true],   // case-insensitive
    ["openai/gpt-4.1", false],
    ["google/gemini-2.5-pro", false],
    ["", false],                       // unknown -> do not guard
    ["local/llama-3", false],
  ];
  for (const [input, expected] of cases) {
    it(`${JSON.stringify(input)} -> ${expected}`, () => {
      assert.equal(isGuardedModelKey(input), expected);
    });
  }

  it("respects a custom pattern list", () => {
    assert.equal(isGuardedModelKey("openai/gpt-4.1", ["gpt"]), true);
    assert.equal(isGuardedModelKey("anthropic/claude", ["gpt"]), false);
  });
});

// ─── isAllowlistedPath ────────────────────────────────────────────────────

describe("isAllowlistedPath", () => {
  const allowed = [
    "package-lock.json",
    "a/b/package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bundle.min.js",
    "styles.min.css",
    "something.lock",
    "types.generated.ts",
    "schema.generated.py",
    "dist/index.js",
    "packages/x/dist/deep/file.ts",
  ];
  for (const p of allowed) {
    it(`allowlisted: ${p}`, () => assert.equal(isAllowlistedPath(p), true));
  }

  const blocked = [
    "src/index.ts",
    "auth.ts",
    "README.md",
    "lib/distance.ts",  // "dist" substring without a path boundary
    "my.generated",     // no extension after .generated
  ];
  for (const p of blocked) {
    it(`not allowlisted: ${p}`, () => assert.equal(isAllowlistedPath(p), false));
  }
});

// ─── measureEdits ─────────────────────────────────────────────────────────

describe("measureEdits", () => {
  it("sums chars across edits", () => {
    const { chars } = measureEdits([{ newText: "abc" }, { newText: "de" }]);
    assert.equal(chars, 5);
  });

  it("sums per-edit line counts WITHOUT phantom join newlines", () => {
    // two 1-line edits must total 2 lines, not 3
    const { lines } = measureEdits([{ newText: "one" }, { newText: "two" }]);
    assert.equal(lines, 2);
  });

  it("handles multi-line newText", () => {
    const { lines, chars } = measureEdits([
      { newText: "a\nb\nc" },  // 3 lines, 5 chars
      { newText: "d\ne" },     // 2 lines, 3 chars
    ]);
    assert.equal(lines, 5);
    assert.equal(chars, 8);
  });

  it("treats missing newText as empty", () => {
    const { lines, chars } = measureEdits([{}, { newText: "" }]);
    assert.equal(lines, 0);
    assert.equal(chars, 0);
  });

  it("catches the 3-line skeleton + 1 giant edit bypass", () => {
    const huge = Array.from({ length: 500 }, (_, i) => `line ${i}`).join("\n");
    const { lines } = measureEdits([{ newText: huge }]);
    assert.ok(lines > MAX_LINES, `expected >${MAX_LINES}, got ${lines}`);
  });
});

// ─── createSizeGuard ──────────────────────────────────────────────────────

describe("createSizeGuard", () => {
  it("passes small content", () => {
    const g = createSizeGuard();
    assert.equal(g.evaluate("a.ts", 10, 100), "pass");
  });

  it("passes content exactly at the limits", () => {
    const g = createSizeGuard();
    assert.equal(g.evaluate("a.ts", MAX_LINES, MAX_CHARS), "pass");
  });

  it("blocks when over the line limit", () => {
    const g = createSizeGuard();
    assert.equal(g.evaluate("a.ts", MAX_LINES + 1, 100), "block");
  });

  it("blocks when over the char limit even with few lines", () => {
    const g = createSizeGuard();
    assert.equal(g.evaluate("a.ts", 1, MAX_CHARS + 1), "block");
  });

  it("loop-breaker: blocks N times, then releases permanently", () => {
    const g = createSizeGuard();
    for (let i = 0; i < RELEASE_AFTER_BLOCKS; i++) {
      assert.equal(g.evaluate("big.ts", 999, 99999), "block", `block #${i + 1}`);
    }
    assert.equal(g.evaluate("big.ts", 999, 99999), "release");
    // permanently released after that
    assert.equal(g.evaluate("big.ts", 999, 99999), "pass");
    assert.equal(g.evaluate("big.ts", 5000, 500000), "pass");
  });

  it("tracks paths independently", () => {
    const g = createSizeGuard();
    assert.equal(g.evaluate("a.ts", 999, 99999), "block");
    assert.equal(g.evaluate("b.ts", 999, 99999), "block");
    assert.equal(g.attempts("a.ts"), 1);
    assert.equal(g.attempts("b.ts"), 1);
  });

  it("released path is never re-blocked", () => {
    const g = createSizeGuard({ releaseAfterBlocks: 1 });
    assert.equal(g.evaluate("f.ts", 999, 99999), "block");
    assert.equal(g.evaluate("f.ts", 999, 99999), "release");
    assert.equal(g.evaluate("f.ts", 999, 99999), "pass");
    assert.equal(g.evaluate("f.ts", 999, 99999), "pass"); // stays pass
  });

  it("respects custom options", () => {
    const g = createSizeGuard({ maxLines: 10, maxChars: 100, releaseAfterBlocks: 1 });
    assert.equal(g.evaluate("a.ts", 11, 0), "block");
    assert.equal(g.evaluate("a.ts", 11, 0), "release");
  });
});

// ─── guidance ─────────────────────────────────────────────────────────────

describe("guidance", () => {
  it("includes real line/char numbers and limits", () => {
    const msg = guidance(342, 9847, "write");
    assert.ok(msg.includes("342 lines"));
    assert.ok(msg.includes("9847 chars"));
    assert.ok(msg.includes(`${MAX_LINES} lines`));
    assert.ok(msg.includes(`${MAX_CHARS} chars`));
  });

  it("gives skeleton+edit steps for multi-line content", () => {
    const msg = guidance(342, 9847, "write");
    assert.ok(msg.includes("skeleton"));
    assert.ok(msg.includes("TODO"));
  });

  it("gives a different hint for single-line content", () => {
    const msg = guidance(1, 9000, "write");
    assert.ok(msg.includes("allowlist"));
    assert.ok(!msg.includes("// TODO")); // skeleton advice does not apply
  });
});

// ─── Config sanity ────────────────────────────────────────────────────────

describe("config", () => {
  it("has sane defaults", () => {
    assert.ok(MAX_LINES > 0);
    assert.ok(MAX_CHARS > 0);
    assert.ok(RELEASE_AFTER_BLOCKS >= 1);
    assert.ok(ALLOWLIST.length > 0);
  });
});
