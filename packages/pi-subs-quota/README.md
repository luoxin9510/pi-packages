# 📊 pi-subs-quota

**Know before you're throttled.** A pi extension that shows your live Claude quota
directly below the editor — no powerline, no extra API calls, no configuration.

<p align="center">
  <img src="https://raw.githubusercontent.com/luoxin9510/pi-packages/main/packages/pi-subs-quota/assets/quota-viz.png" alt="pi-subs-quota — know before you're throttled" width="840">
</p>

```bash
pi install npm:@nukcole-xinluo9510/pi-subs-quota
```

---

## The insight

Every Anthropic API response already carries this:

```
anthropic-ratelimit-unified-5h-utilization: 0.14
anthropic-ratelimit-unified-7d-utilization: 0.06
anthropic-ratelimit-unified-5h-reset: 1781764800
```

This extension intercepts those headers via pi's `after_provider_response` hook and
renders them as a persistent widget row — reading free data that was always there.

> **Zero extra API calls. Zero extra cost. Zero configuration.**

## What you see

A compact line appears below your editor on every turn:

```
 🟢 5h:14% ↺2h30m   🟢 7d:6% ↺4d12h   ⏰5h
```

Type `/quota` for a detailed breakdown:

```
╭─ Claude Subscription Quota ─────────────────
│ 5h window  🟢 ████░░░░░░░░░░░░  14%
│            ↺ resets in 2h30m
│ 7d window  🟢 █░░░░░░░░░░░░░░░   6%
│            ↺ resets in 4d12h
│ Active limit: 5-hour window
╰─ Updated: 14:32:01 ────────────────
```

| Icon | Meaning |
|------|---------|
| 🟢 | < 70% used — you're fine |
| 🟡 | 70–90% used — start wrapping up |
| 🔴 | > 90% used — throttle imminent |
| 🔶 | Throttled |
| ⛔ | Blocked |

The `⏰5h` / `⏰7d` indicator shows which window is currently your binding constraint.

## Highlights

- 📡 **Passive by design** — reads headers already in every API response, adds nothing
- 🖥️ **No powerline required** — uses pi's native `setWidget` API, works standalone
- 🔑 **Dual auth** — auto-detects OAuth subscription token or `ANTHROPIC_API_KEY`
- 🚀 **Instant startup** — probes on session start so you see data before your first turn
- 🪶 **Zero dependencies** — only node built-ins, one peer (`@earendil-works/pi-coding-agent`)

## Install

```bash
pi install npm:@nukcole-xinluo9510/pi-subs-quota
```

Restart pi. The widget appears automatically.

## How it works

`pi-subs-quota` hooks two pi events:

**`after_provider_response`** — fires on every API call pi makes. Extracts the
`anthropic-ratelimit-unified-*` headers and calls `ctx.ui.setWidget()` to update
the row below your editor. No requests of its own — pure interception.

**`session_start`** — makes one lightweight probe (1-token message to claude-haiku)
to populate initial values before you send your first message.

Auth is resolved in order:

1. `ANTHROPIC_API_KEY` environment variable
2. `~/.pi/agent/auth.json` → OAuth access token (subscription login)
3. `~/.pi/agent/auth.json` → API key

## Requirements

- pi 0.79+

## License

MIT
