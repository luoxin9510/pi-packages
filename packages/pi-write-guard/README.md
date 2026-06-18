# 🛡️ pi-write-guard

Stop the LLM from landing **broken, half-written files**. When a model tries to
write a huge file in one shot, the output can be truncated mid-stream and leave
a corrupted file on disk. `pi-write-guard` forces large files to be built
incrementally — a skeleton first, then small edits — so nothing can be
truncated into garbage.

```bash
pi install npm:@nukcole-xinluo9510/pi-write-guard
```

---

## What it does (two honest layers)

### 1. STEER — `before_agent_start`
Injects a short policy into the system prompt telling the model to build large
files with a skeleton + incremental edits **before** it generates. This is the
part that actually saves output tokens, because it changes behaviour ahead of
generation.

### 2. GUARD — `tool_call` on `write` + `edit`
Blocks any single `write` or `edit` larger than the limit. Its job is **file
safety**: a giant single operation can be truncated mid-stream and land a
broken file. Guarding forces the work into small pieces that cannot be
truncated into garbage.

> **Honest note:** a `tool_call` block fires *after* the model already emitted
> the call as output tokens, so the GUARD does **not** save those tokens. It
> protects the file on disk. The token savings come from the STEER layer.

When blocked, the model receives concrete guidance:

```
Blocked an oversized write: 342 lines / 11200 chars (limit 200 lines / 8000 chars).
A single write this large can be truncated mid-stream and land a broken file.

Build it incrementally instead:
1. write a compact skeleton — imports, signatures, and a // TODO: <what>
   placeholder line for each section.
2. edit each // TODO placeholder one at a time with its real content.
```

## Defaults

| Setting | Value | Meaning |
|---------|-------|---------|
| `MAX_LINES` | 200 | Block a single write/edit over this many lines |
| `MAX_CHARS` | 8000 | …or over this many characters |
| `RELEASE_AFTER_BLOCKS` | 2 | After N blocks on one path, release it permanently (no retry loops) |
| guarded models | `claude`, `deepseek` | Only big-context models where chunking matters |

Generated/lock/minified files (`package-lock.json`, `*.min.js`, `dist/**`,
`*.generated.*`, …) are never blocked.

## Design notes

- **Loop-safe:** after a path is blocked `RELEASE_AFTER_BLOCKS` times it is
  released for the rest of the session, so a model that genuinely must write a
  large file is never trapped in an infinite retry.
- **Covers the edit side-door:** a "3-line skeleton + one giant `edit`" bypass
  is caught because the guard sizes the total replacement output of the call.
- **Model detection:** reads the live current model; if the model is unknown
  (only momentarily at startup) it skips rather than wrongly guarding
  non-target models.

## Requirements

- pi 0.79+

## License

MIT
