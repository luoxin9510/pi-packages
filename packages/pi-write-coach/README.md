# 🏋️ pi-write-coach

**A coach for large files — game plan before, whistle after.**

When a model tries to write a large file in one shot, the output can hit
`max_tokens` mid-stream and land a **truncated, broken file** on disk.
`pi-write-coach` prevents this by teaching the model to build large files
incrementally: skeleton first, then small edits — each step too small to
truncate into garbage.

<p align="center">
  <img src="https://raw.githubusercontent.com/luoxin9510/pi-packages/main/packages/pi-write-coach/assets/coach-viz.png" alt="pi-write-coach — game plan before, whistle after" width="840">
</p>

```bash
pi install npm:@nukcole-xinluo9510/pi-write-coach
```

---

## The problem

```
model wants to write 800-line file
  → emits 15,000+ output tokens in one shot
  → hits max_tokens limit mid-stream
  → auth.ts lands on disk: broken, half-written
  → you need to ask it to rewrite anyway
```

## The solution

```
STEER injects the game plan:
  → write a skeleton first (imports, signatures, // TODO markers)
  → then edit each section one at a time

GUARD blows the whistle if a write is still too big:
  → blocks single writes/edits over 200 lines / 8000 chars
  → tells the model exactly how to fix it
  → releases path after 2 blocks to prevent retry loops
```

---

## Two honest layers

### STEER — `before_agent_start`

Injects a large-file policy into the system prompt **before** the model
generates anything. This is the part that actually saves output tokens —
it changes model behaviour ahead of generation.

### GUARD — `tool_call` (write + edit)

Blocks oversized single writes and edits. Its job is **file safety**: a
giant single write can be truncated mid-stream and land a broken file.
The guard forces the work into small, untruncatable pieces.

> **Honest note:** `tool_call` fires *after* the model already emitted
> the call as output tokens — the GUARD does **not** recover those tokens.
> It protects the file on disk. Token savings come from STEER only.

---

## What it guards

| Operation | What is measured | When blocked |
|-----------|-----------------|--------------|
| `write` | `content` length | > 200 lines OR > 8000 chars |
| `edit` | sum of all `edits[].newText` | > 200 lines OR > 8000 chars |

The "3-line skeleton + 1 giant edit" bypass is caught: the guard sums
the total replacement output of the call, not per-edit.

**Never blocked:** `package-lock.json`, `*.min.js`, `*.lock`,
`*.generated.*`, `dist/**` (add custom paths by extending `ALLOWLIST`
in `core.ts`).

## Loop-breaker

After a path is blocked `RELEASE_AFTER_BLOCKS` times (default: 2), it
is permanently released for the session. A model that genuinely must
write a large file is never trapped in an infinite retry loop.

## Guarded models

Only applies to big-context models where chunking matters most:
`claude` and `deepseek` (substring match on `provider/id`). Other models
(gpt, gemini, local) are never affected.

## Install

```bash
pi install npm:@nukcole-xinluo9510/pi-write-coach
```

## Requirements

- pi 0.79+

## Testing

```bash
cd packages/pi-write-coach
npm test   # 49 unit tests, no pi runtime needed
```

Covers: `countLines`, `isGuardedModelKey`, `isAllowlistedPath`,
`measureEdits`, `createSizeGuard` state machine (block → loop-breaker →
release → permanent pass), `guidance` message content.

## License

MIT
