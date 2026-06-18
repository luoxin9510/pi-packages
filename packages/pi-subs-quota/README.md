# @nukcole-xinluo9510/pi-subs-quota

Pi extension — live Claude subscription (and API) quota widget, shown below the editor without any extra dependencies.

## Features

- **Live widget** — shows a compact quota bar below the editor on every turn
- **Works for both** subscription (OAuth) and regular API key users
- **Zero overhead** — reads rate-limit headers from existing API responses, no extra requests
- **Startup probe** — fetches initial values immediately when pi starts
- **`/quota` command** — detailed breakdown with progress bars and reset countdowns

## Install

```bash
pi install npm:@nukcole-xinluo9510/pi-subs-quota
```

## Usage

Once installed, a widget appears automatically below the editor:

```
 🟢 5h:14% ↺2h30m   🟢 7d:6% ↺4d12h   ⏰5h
```

For a detailed view, type `/quota` in any pi session:

```
╭─ Claude Subscription Quota ─────────────────
│ 5h window  🟢 ██░░░░░░░░░░░░░░  14%
│            ↺ resets in 2h30m
│ 7d window  🟢 █░░░░░░░░░░░░░░░   6%
│            ↺ resets in 4d12h
│ Active limit: 5-hour window
╰─ Updated: 14:32:01 ────────────────
```

| Icon | Meaning |
|------|---------|
| 🟢 | < 70% used |
| 🟡 | 70–90% used |
| 🔴 | > 90% used |
| ⛔ | Blocked |
| 🔶 | Throttled |

## How it works

Anthropic includes rate-limit utilization headers on every API response:

```
anthropic-ratelimit-unified-5h-utilization: 0.14
anthropic-ratelimit-unified-7d-utilization: 0.06
```

This extension intercepts those headers via pi's `after_provider_response` hook and renders them as a persistent `setWidget` row — no powerline required.

Auth is auto-detected from `~/.pi/agent/auth.json` (OAuth subscription) or `ANTHROPIC_API_KEY` (regular API key).

## Requirements

- pi 0.79+

## License

MIT
