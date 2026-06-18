import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

import {
  createSizeGuard,
  guidance,
  isAllowlistedPath,
  isGuardedModelKey,
  MAX_LINES,
  measureEdits,
} from "./core.ts";

export default function (pi: ExtensionAPI) {
  const guard = createSizeGuard();
  let modelKeyCache = "";

  function currentModelKey(ctx: unknown): string {
    const m = (ctx as { model?: { provider?: string; id?: string } })?.model;
    if (m?.provider && m?.id) {
      modelKeyCache = `${m.provider}/${m.id}`.toLowerCase();
    }
    return modelKeyCache;
  }

  function isGuarded(ctx: unknown): boolean {
    // Unknown model at startup: skip rather than punish non-target models.
    return isGuardedModelKey(currentModelKey(ctx));
  }

  // Backup: populate cache from model change events (restore / cycle).
  pi.on("model_select", (event) => {
    modelKeyCache = `${event.model.provider}/${event.model.id}`.toLowerCase();
  });

  // ── LAYER 1: STEER ─────────────────────────────────────────────────────────
  pi.on("before_agent_start", (event, ctx) => {
    if (!isGuarded(ctx)) return;
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\n## Large-file policy (enforced by pi-write-coach)\n" +
        `Never author a new file larger than ~${MAX_LINES} lines in one ` +
        "`write`, and never fill a file with one giant `edit`. Instead:\n" +
        "1. `write` a compact skeleton (imports, signatures, `// TODO:` markers).\n" +
        "2. `edit` each `// TODO` section one at a time.\n" +
        "This keeps every output small and cannot be truncated into a broken " +
        "file. Oversized single writes and edits are blocked.",
    };
  });

  // ── LAYER 2: GUARD (write + edit) ─────────────────────────────────────────
  pi.on("tool_call", (event, ctx) => {
    if (!isGuarded(ctx)) return;

    let path: string;
    let lines: number;
    let chars: number;
    let kind: "write" | "edit";

    if (isToolCallEventType("write", event)) {
      path = event.input.path ?? "";
      const content = event.input.content ?? "";
      lines = content.split("\n").length;
      chars = content.length;
      kind = "write";
    } else if (isToolCallEventType("edit", event)) {
      path = event.input.path ?? "";
      const edits =
        (event.input as { edits?: { newText?: string }[] }).edits ?? [];
      ({ lines, chars } = measureEdits(edits));
      kind = "edit";
    } else {
      return;
    }

    if (isAllowlistedPath(path)) return;

    const result = guard.evaluate(path, lines, chars);
    if (result === "pass" || result === "release") return;

    const prior = guard.attempts(path) - 1;
    return {
      block: true,
      reason:
        `${guidance(lines, chars, kind)}\n\n` +
        `(Attempt ${prior + 1}/${guard.attempts(path)}; after that this path ` +
        `is released to avoid a retry loop.)`,
    };
  });
}
