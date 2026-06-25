# 🧩 Extension Guy

**A pi extension that flips other extensions.** Run `/extensions` in any pi
session and get a live control panel — every local extension on one screen,
each on a switch you can flip on or off and **hot-reload on the spot**.

pi already hot-reloads *everything at once* with `/reload`. Extension Guy makes
it **per-extension**: toggle one off, hit enter, and it's gone from the running
session — no restart, no `rm`, no config file, no hidden registry.

<p align="center">
  <img src="https://raw.githubusercontent.com/luoxin9510/pi-packages/main/packages/pi-extension-guy/assets/switchboard.png" alt="Extension Guy — the filename is the switch" width="840">
</p>

```
/extensions
┌─ Extensions (managed dirs only) ────────────┐
│  ── GLOBAL  (~/.pi/agent/extensions) ──      │
│  ▶ [x] git-checkpoint     file               │
│    [ ] doom-overlay       index-dir   *      │
│    [x] my-tools           manifest-dir       │
│    [-] extension-guy      (self)             │
│  ── PROJECT  (.pi/extensions) ──             │
│    [x] repo-linter        file               │
│                                              │
│  ↑/↓ move   space toggle                     │
│  enter apply+reload   esc cancel             │
└──────────────────────────────────────────────┘
```

---

## Why it's different — built the pi way

pi already ships the two mechanisms you need: it **discovers extensions by
filename**, and it **hot-reloads** them with `/reload`. Extension Guy doesn't
fork the core or invent a new system — it just **composes what pi already has**.

To turn an extension off, it renames the file so the loader stops finding it
(`foo.ts` → `foo.ts.disabled`), then runs pi's own reload. That's the whole
trick. Which means the most important design decision is what it *doesn't* add:

- **No new state.** The on-disk filename *is* the switch. `foo.ts` is on,
  `foo.ts.disabled` is off. Nothing to keep in sync, nothing to corrupt.
- **No database, no config schema, no daemon.** Want to know what's enabled?
  `ls`. Want it to survive a restart? It already does — the files are the truth.
- **No core changes.** Pure public `ExtensionAPI` (`registerCommand`,
  `ctx.ui.custom`, `ctx.reload`) plus `fs`. It runs on stock pi.

> **No new state — the filename is the switch.**
> It composes pi's mechanisms instead of replacing them.

That's why the panel never lies: its `[x]` / `[ ]` is computed by replicating
pi's *actual* loader rules, not by trusting a side-file that could drift.

## Highlights

- 🎛️ **One panel** — see every local extension; arrow to move, space to flip,
  enter to apply.
- 🔥 **Per-extension hot reload** — pi reloads everything at once; Extension Guy
  flips one extension and hot-reloads it live in the current session, no restart.
- 🗄️ **Filesystem is the database** — the filename is the state. Inspect with
  `ls`, survives restarts, no hidden registry to desync.
- 🧩 **Zero core changes** — built entirely on the public extension API; works on
  unmodified pi.
- 🪶 **Zero config, zero deps** — install and run. Nothing to set up.
- 🔒 **Safe by construction** — the manager locks itself, leaves symlink-escape
  and unmanageable entries read-only, and rolls back a multi-file rename if any
  step fails, so a directory is never left half-toggled.
- 🪞 **Honest state** — `[x]`/`[ ]` mirrors pi's real loader (`isExtensionFile` +
  `resolveExtensionEntries`), including manifest dirs that resolve to nothing.

## Install

```bash
# From npm
pi add npm:@nukcole-xinluo9510/pi-extension-guy

# Or from a local checkout during development
pi add /path/to/pi-extension-guy
```

That's it. No other setup. Then run `/extensions` in any session.

## Usage

| Key | Action |
|-----|--------|
| `↑` / `↓` | move selection (skips section headers) |
| `space` | toggle the selected item — pending only; `*` marks unsaved |
| `enter` | apply all pending toggles to disk, then reload |
| `esc` | cancel — discard pending changes, touch nothing |

Toggles are batched: flip several, then apply once for a single reload.

## How it works

Extension Guy registers one command, `/extensions`. When you run it:

1. It scans the two managed dirs — `~/.pi/agent/extensions/` and
   `<cwd>/.pi/extensions/` — and classifies each entry (single file, index
   directory, or `package.json` manifest directory).
2. It opens a TUI overlay (`ctx.ui.custom`) listing each extension with its real
   enabled/disabled state. Toggling only flips an in-memory flag.
3. On **enter**, it performs all renames first — purely on disk:

   | Shape | Disable | Enable |
   |-------|---------|--------|
   | single file | `foo.ts` → `foo.ts.disabled` | reverse |
   | index dir | `index.ts` **and** `index.js` → `*.disabled` | reverse |
   | manifest dir | `package.json` (+ any sibling `index.*`) → `*.disabled` | reverse |

4. Then it calls `ctx.reload()` — the same flow as `/reload` — and returns. The
   reload re-discovers extensions, so disabled ones vanish and enabled ones come
   back, live in the current session.

Renames are prechecked and rolled back per item, so a concurrent change produces
a clean error instead of a half-renamed directory.

## The boundary (enforced, not asked)

Some rows are deliberately **read-only**, locked in code:

- 🔒 **self** — Extension Guy can't disable itself.
- 🔗 **symlink** — entries whose real target escapes the managed dirs.
- 🚫 **unloadable** — a manifest whose `pi.extensions` resolve to nothing.

And what it honestly **won't** manage (because pi exposes no API to enumerate
loaded extensions): npm/git packages installed via `pi add`, and extensions
added through `settings.json` paths. Those live outside the managed dirs, so they
aren't shown. The panel header says "managed dirs only" — it never pretends the
list is exhaustive.

One more honest note: a toggle is **global**. The rename changes discovery for
every pi process and future session; other running instances pick it up on their
next reload.

## Requirements

- pi 0.79+

(That's the whole list.)

## Development

```bash
npm run check   # tsc --noEmit against real pi types
npm test        # node --test (scan classification, toggle rename + rollback)
```

Layout:

```
extensions/extension-guy/
  index.ts   # /extensions command: scan → panel → apply → reload
  scan.ts    # disk discovery, mirrors pi's resolveExtensionEntries
  toggle.ts  # rename engine: precheck + per-item rollback
  panel.ts   # TUI overlay (Focusable component)
```

## License

MIT
