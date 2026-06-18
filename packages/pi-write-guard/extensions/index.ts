import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

/**
 * pi-write-guard — keep large file generation safe and incremental.
 *
 * Two honest layers:
 *
 *   1. STEER (before_agent_start)
 *      Tells the model to build large files with a skeleton + incremental
 *      edits BEFORE it generates. This is the part that actually saves
 *      output tokens, because it changes behaviour ahead of generation.
 *
 *   2. GUARD (tool_call on write + edit)
 *      Blocks a single oversized write/edit. Its purpose is FILE SAFETY —
 *      a giant single write can be truncated mid-stream (the model hits its
 *      output cap) and land a broken, half-written file. Guarding forces the
 *      file to be built in small pieces that cannot be truncated into garbage.
 *
 *      Note: a tool_call block fires AFTER the model already emitted the call
 *      as output tokens, so the GUARD does NOT save those tokens. It exists to
 *      protect the file on disk, not to save tokens.
 */

// ─── Config ───────────────────────────────────────────────────────────────

// A single write/edit larger than EITHER limit is blocked.
const MAX_LINES = 200;
const MAX_CHARS = 8000;

// After this many blocks on the same path, release it permanently for the
// session, so a model that genuinely must write big cannot be trapped forever.
const RELEASE_AFTER_BLOCKS = 2;

// Only guard big-context models where chunking matters most.
// Substring match on "<provider>/<id>", case-insensitive.
const GUARDED_MODEL_PATTERNS = ["claude", "deepseek"];

// Never block these (generated / lock / minified files).
const ALLOWLIST: RegExp[] = [
  /package-lock\.json$/,
  /pnpm-lock\.yaml$/,
  /yarn\.lock$/,
  /\.min\.(js|css)$/,
  /\.lock$/,
  /\.generated\.[a-z]+$/,
  /(^|\/)dist\//,
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function countLines(s: string): number {
  if (s.length === 0) return 0;
  let n = 1;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++;
  return n;
}

function isAllowlisted(path: string): boolean {
  return ALLOWLIST.some((re) => re.test(path));
}

function guidance(lines: number, chars: number, kind: string): string {
  const singleLine = lines <= 1;
  const head =
    `Blocked an oversized ${kind}: ${lines} lines / ${chars} chars ` +
    `(limit ${MAX_LINES} lines / ${MAX_CHARS} chars). A single write this large ` +
    `can be truncated mid-stream and land a broken file.`;

  if (singleLine) {
    return (
      `${head}\n\n` +
      `This is essentially one ${chars}-char line, so section editing does not ` +
      `apply. If it is generated/data, add its path to pi-write-guard's allowlist. ` +
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

// ─── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Per-path block counts, and paths that have been permanently released.
  const blockCounts = new Map<string, number>();
  const released = new Set<string>();
  let modelKeyCache = "";

  // Reliable current-model key: prefer live ctx.model, fall back to cache.
  function modelKey(ctx: unknown): string {
    const m = (ctx as { model?: { provider?: string; id?: string } })?.model;
    if (m?.provider && m?.id) {
      modelKeyCache = `${m.provider}/${m.id}`.toLowerCase();
    }
    return modelKeyCache;
  }

  function isGuarded(ctx: unknown): boolean {
    const key = modelKey(ctx);
    // If the model is genuinely unknown (only at the very start, before
    // ctx.model / model_select populate), skip — do NOT punish non-target
    // models (gpt/gemini/local). The cache fills in within the first turn.
    if (!key) return false;
    return GUARDED_MODEL_PATTERNS.some((p) => key.includes(p));
  }

  // Backup model key from the event stream (covers restore/cycle).
  pi.on("model_select", (event) => {
    modelKeyCache = `${event.model.provider}/${event.model.id}`.toLowerCase();
  });

  // ── LAYER 1: STEER ─────────────────────────────────────────────────────────
  pi.on("before_agent_start", (event, ctx) => {
    if (!isGuarded(ctx)) return;
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n## Large-file policy (enforced by pi-write-guard)\n" +
        `Never author a new file larger than ~${MAX_LINES} lines in one ` +
        "`write`, and never fill a file with one giant `edit`. Instead:\n" +
        "1. `write` a compact skeleton (imports, signatures, `// TODO:` markers).\n" +
        "2. `edit` each `// TODO` section one at a time.\n" +
        "This keeps every output small and cannot be truncated into a broken " +
        "file. Oversized single writes and edits are blocked.",
    };
  });

  // ── LAYER 2: GUARD (write + edit) ───────────────────────────────────────────
  pi.on("tool_call", (event, ctx) => {
    if (!isGuarded(ctx)) return;

    let path: string;
    let chars: number;
    let lines: number;
    let kind: "write" | "edit";

    if (isToolCallEventType("write", event)) {
      path = event.input.path ?? "";
      const content = event.input.content ?? "";
      chars = content.length;
      lines = countLines(content);
      kind = "write";
    } else if (isToolCallEventType("edit", event)) {
      path = event.input.path ?? "";
      // One edit call can smuggle a whole file via its replacements, and the
      // whole call shares one output stream that can truncate. So size the
      // TOTAL replacement output of the call: sum chars and sum per-edit line
      // counts (no join, so no phantom boundary newlines inflate the count).
      const edits =
        (event.input as { edits?: { newText?: string }[] }).edits ?? [];
      chars = 0;
      lines = 0;
      for (const e of edits) {
        const t = e.newText ?? "";
        chars += t.length;
        lines += countLines(t);
      }
      kind = "edit";
    } else {
      return;
    }

    if (isAllowlisted(path) || released.has(path)) return;

    if (lines <= MAX_LINES && chars <= MAX_CHARS) return;

    // Loop breaker: after N blocks on the same path, release it for good so a
    // model that truly must write big is never trapped in an infinite retry.
    const prior = blockCounts.get(path) ?? 0;
    if (prior >= RELEASE_AFTER_BLOCKS) {
      released.add(path);
      return;
    }
    blockCounts.set(path, prior + 1);

    return {
      block: true,
      reason:
        `${guidance(lines, chars, kind)}\n\n` +
        `(Attempt ${prior + 1}/${RELEASE_AFTER_BLOCKS}; after that this path is ` +
        `released to avoid a retry loop.)`,
    };
  });
}
