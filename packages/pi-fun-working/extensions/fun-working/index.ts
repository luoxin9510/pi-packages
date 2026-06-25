/**
 * Fun Working Messages 🎉  (main logic)
 *
 * While the agent is working, replaces the default gray "Working..." with:
 *   1. A set of cycling/random themed phrases -> edit messages.ts
 *   2. Per-hook status memes (pass / fail / …) -> edit events.ts
 *   3. Random colors + a fun spinner           -> edit settings.ts
 *
 * Restores the default automatically when work finishes.
 *
 * You usually don't need to touch this file.
 * Change phrases -> messages.ts ; per-hook memes -> events.ts ; style -> settings.ts
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type EventMessageConfig, EVENT_MESSAGES } from "./events.ts";
import { MESSAGES } from "./messages.ts";
import { SETTINGS } from "./settings.ts";

// ============================================================================
// Pure helpers (exported for tests)
// ============================================================================

/** HSL -> RGB. h, s, l are all in 0..1; returns 0..255 channels. */
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const hue2rgb = (p: number, q: number, t: number) => {
		if (t < 0) t += 1;
		if (t > 1) t -= 1;
		if (t < 1 / 6) return p + (q - p) * 6 * t;
		if (t < 1 / 2) return q;
		if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
		return p;
	};
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	return [
		Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
		Math.round(hue2rgb(p, q, h) * 255),
		Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
	];
}

/** Replace `{key}` placeholders in `text` with values from `vars`. */
export function fillTemplate(text: string, vars: Record<string, string | number>): string {
	let out = text;
	for (const [k, v] of Object.entries(vars)) {
		out = out.replaceAll(`{${k}}`, String(v));
	}
	return out;
}

/** Effective fire probability, clamped to 0..1. */
export function effectiveChance(base: number, multiplier: number): number {
	const c = (Number.isFinite(base) ? base : 1) * (Number.isFinite(multiplier) ? multiplier : 1);
	return c < 0 ? 0 : c > 1 ? 1 : c;
}

// ============================================================================
// Rendering helpers
// ============================================================================

const color = (text: string, [r, g, b]: [number, number, number]) =>
	`\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;

/** Pick a random color from the palette. */
const randomColor = (): [number, number, number] =>
	SETTINGS.palette[Math.floor(Math.random() * SETTINGS.palette.length)] ?? [255, 255, 255];

/**
 * Paint text according to the configured colorMode. `phase` drives the rainbow
 * flow; `solid` is the per-phrase random color used by colorMode="random".
 */
function paint(text: string, phase: number, solid: [number, number, number]): string {
	if (SETTINGS.colorMode === "solid") return color(text, SETTINGS.solidColor);
	if (SETTINGS.colorMode === "random") return color(text, solid);
	let out = "";
	for (let i = 0; i < text.length; i++) {
		const h = (phase + i * SETTINGS.rainbowSpread) % 1;
		const rgb = hslToRgb(h, SETTINGS.rainbowSaturation, SETTINGS.rainbowLightness);
		out += `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text[i]}`;
	}
	return `${out}\x1b[39m`;
}

/** Pick a random message from a config's pool and fill placeholders. */
function pickMessage(cfg: EventMessageConfig, vars: Record<string, string | number>): string {
	const pool = cfg.messages.length > 0 ? cfg.messages : [""];
	return fillTemplate(pool[Math.floor(Math.random() * pool.length)], vars);
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
	const messages = MESSAGES.length > 0 ? MESSAGES : ["Working"];
	let textTimer: ReturnType<typeof setInterval> | null = null;
	let phase = 0;
	let msgIndex = Math.floor(Math.random() * messages.length);
	let currentColor = randomColor(); // for colorMode="random", changes on phrase switch
	let lastSwitch = Date.now();

	function stop(ctx: ExtensionContext) {
		if (textTimer) {
			clearInterval(textTimer);
			textTimer = null;
		}
		ctx.ui.setWorkingMessage(); // restore default text
		ctx.ui.setWorkingIndicator(); // restore default spinner
	}

	function nextMessage(): number {
		if (SETTINGS.randomOrder) {
			if (messages.length === 1) return 0;
			let n = msgIndex;
			while (n === msgIndex) n = Math.floor(Math.random() * messages.length);
			return n;
		}
		return (msgIndex + 1) % messages.length;
	}

	function start(ctx: ExtensionContext) {
		stop(ctx);

		// Fun spinner (built-in frame-by-frame playback)
		const frames = SETTINGS.spinnerColor
			? SETTINGS.spinnerFrames.map((f) => color(f, SETTINGS.spinnerColor!))
			: SETTINGS.spinnerFrames;
		ctx.ui.setWorkingIndicator({ frames, intervalMs: SETTINGS.spinnerIntervalMs });

		// Text: themed phrases that switch on a timer, colored per settings.
		const tick = () => {
			const now = Date.now();
			if (now - lastSwitch >= SETTINGS.messageSwitchMs) {
				msgIndex = nextMessage();
				currentColor = randomColor(); // switch color every time the phrase switches
				lastSwitch = now;
			}
			phase = (phase + SETTINGS.rainbowSpeed * (SETTINGS.textRefreshMs / 1000)) % 1;
			ctx.ui.setWorkingMessage(`${paint(messages[msgIndex], phase, currentColor)}${SETTINGS.suffix}`);
		};
		tick();
		textTimer = setInterval(tick, SETTINGS.textRefreshMs);
	}

	// ---- Event messages (pass / fail / etc) ----------------------------
	let agentStartedAt = Date.now();

	// Dispatch a configured event message to its channel.
	function emit(key: string, ctx: ExtensionContext, vars: Record<string, string | number> = {}) {
		if (!SETTINGS.events.enabled) return; // global master switch
		const cfg = EVENT_MESSAGES[key];
		if (!cfg || !cfg.enabled) return;
		// Roll the dice: per-event `chance` scaled by the global multiplier.
		if (Math.random() >= effectiveChance(cfg.chance ?? 1, SETTINGS.events.chanceMultiplier)) return;
		const text = pickMessage(cfg, vars);
		if (!text) return;
		if (cfg.channel === "notify") {
			ctx.ui.notify(text, cfg.notifyType ?? "info");
		} else {
			const statusKey = cfg.statusKey ?? "fun-event";
			// Random color per status message when enabled.
			const shown = SETTINGS.events.colorizeStatus ? color(text, randomColor()) : text;
			ctx.ui.setStatus(statusKey, shown);
			if (cfg.clearAfterMs && cfg.clearAfterMs > 0) {
				setTimeout(() => ctx.ui.setStatus(statusKey, undefined), cfg.clearAfterMs);
			}
		}
	}

	pi.on("agent_start", async (_event, ctx) => {
		agentStartedAt = Date.now();
		emit("agentStart", ctx);
		start(ctx);
	});
	pi.on("agent_end", async (_event, ctx) => {
		stop(ctx);
		emit("agentDone", ctx, { ms: Date.now() - agentStartedAt });
	});
	pi.on("session_shutdown", async (_event, ctx) => stop(ctx));

	pi.on("tool_execution_start", async (event, ctx) => {
		emit("toolStart", ctx, { tool: event.toolName });
	});
	pi.on("tool_execution_end", async (event, ctx) => {
		emit(event.isError ? "toolFail" : "toolPass", ctx, { tool: event.toolName });
	});
	pi.on("turn_start", async (event, ctx) => {
		emit("turnStart", ctx, { turn: event.turnIndex });
	});
	pi.on("turn_end", async (event, ctx) => {
		emit("turnEnd", ctx, { turn: event.turnIndex });
	});

	// ---- All remaining hooks ------------------------------------------
	pi.on("session_start", async (_event, ctx) => emit("sessionStart", ctx));
	pi.on("session_compact", async (_event, ctx) => emit("sessionCompact", ctx));
	pi.on("message_start", async (_event, ctx) => emit("messageStart", ctx));
	pi.on("message_end", async (_event, ctx) => emit("messageEnd", ctx));
	pi.on("model_select", async (event, ctx) => {
		if (event.source === "restore") return; // skip noisy session-restore events
		emit("modelSelect", ctx, { model: event.model.id });
	});
	pi.on("thinking_level_select", async (event, ctx) => {
		emit("thinkingLevel", ctx, { level: String(event.level) });
	});
	pi.on("user_bash", async (event, ctx) => {
		emit("userBash", ctx, { cmd: event.command });
	});
	pi.on("input", async (_event, ctx) => emit("input", ctx));
}
