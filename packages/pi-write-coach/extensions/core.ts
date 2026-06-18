/**
 * Pure functions with no pi-coding-agent dependency.
 * Exported here so tests can import without loading the extension runtime.
 */

// ─── Config ───────────────────────────────────────────────────────────────

export const MAX_LINES = 200;
export const MAX_CHARS = 8000;
export const RELEASE_AFTER_BLOCKS = 2;

const DEFAULT_GUARDED_PATTERNS = ["claude", "deepseek"];

export const ALLOWLIST: RegExp[] = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.(js|css)$/,
  /\.lock$/,
  /\.generated\.[a-z]+$/,
  /(^|\/)dist\//,
];

// ─── Pure helpers ─────────────────────────────────────────────────────────

export function countLines(s: string): number {
  if (s.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

export function isAllowlistedPath(path: string): boolean {
  return ALLOWLIST.some((re) => re.test(path));
}

export function isGuardedModelKey(
  key: string,
  patterns: string[] = DEFAULT_GUARDED_PATTERNS
): boolean {
  if (!key) return false;
  const lower = key.toLowerCase();
  return patterns.some((p) => lower.includes(p));
}

export function measureEdits(
  edits: { newText?: string }[]
): { lines: number; chars: number } {
  let lines = 0;
  let chars = 0;
  for (const e of edits) {
    const t = e.newText ?? "";
    chars += t.length;
    lines += countLines(t);
  }
  return { lines, chars };
}

export function guidance(lines: number, chars: number, kind: string): string {
  const singleLine = lines <= 1;
  const head =
    `Blocked an oversized ${kind}: ${lines} lines / ${chars} chars ` +
    `(limit ${MAX_LINES} lines / ${MAX_CHARS} chars). A single ${kind} this ` +
    `large can be truncated mid-stream and land a broken file.`;

  if (singleLine) {
    return (
      `${head}\n\n` +
      `This is essentially one ${chars}-char line, so section editing does not ` +
      `apply. If it is generated/data, add its path to pi-write-coach's allowlist. ` +
      `If hand-authored, restructure it into multiple lines so it can be built ` +
      `incrementally.`
    );
  }

  return (
    `${head}\n\n` +
    "Build it incrementally instead:\n" +
    "1. `write` a compact skeleton — imports, signatures, and a `// TODO: <what>` " +
    "placeholder line for each section.\n" +
    "2. `edit` each `// TODO` placeholder one at a time with its real content.\n" +
    "Each step stays small and cannot be truncated into garbage."
  );
}

// ─── Size guard state machine ──────────────────────────────────────────────

export type GuardResult = "pass" | "block" | "release";

interface SizeGuardOptions {
  maxLines?: number;
  maxChars?: number;
  releaseAfterBlocks?: number;
}

export function createSizeGuard(opts: SizeGuardOptions = {}) {
  const maxLines = opts.maxLines ?? MAX_LINES;
  const maxChars = opts.maxChars ?? MAX_CHARS;
  const releaseAfter = opts.releaseAfterBlocks ?? RELEASE_AFTER_BLOCKS;

  const blockCounts = new Map<string, number>();
  const released = new Set<string>();

  return {
    evaluate(path: string, lines: number, chars: number): GuardResult {
      if (released.has(path)) return "pass";
      if (lines <= maxLines && chars <= maxChars) return "pass";
      const prior = blockCounts.get(path) ?? 0;
      if (prior >= releaseAfter) {
        released.add(path);
        return "release";
      }
      blockCounts.set(path, prior + 1);
      return "block";
    },
    attempts(path: string): number {
      return blockCounts.get(path) ?? 0;
    },
  };
}
