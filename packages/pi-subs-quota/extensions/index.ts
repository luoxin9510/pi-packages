import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuotaState {
	util5h: number | null; // 0.0 ~ 1.0
	util7d: number | null;
	reset5h: Date | null; // UTC reset time
	reset7d: Date | null;
	status5h: string | null; // "allowed" | "throttled" | "blocked"
	status7d: string | null;
	claim: string | null; // "five_hour" | "seven_day"
	lastUpdated: Date | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function pct(util: number | null): string {
	if (util === null) return "?";
	return `${Math.round(util * 100)}%`;
}

function statusIcon(util: number | null, status: string | null): string {
	if (status === "blocked") return "⛔";
	if (status === "throttled") return "🔶";
	if (util === null) return "○";
	const p = util * 100;
	if (p >= 90) return "🔴";
	if (p >= 70) return "🟡";
	return "🟢";
}

function timeUntil(date: Date | null): string {
	if (!date) return "";
	const diff = date.getTime() - Date.now();
	if (diff <= 0) return "resetting...";
	const h = Math.floor(diff / 3600000);
	const m = Math.floor((diff % 3600000) / 60000);
	if (h > 0) return `${h}h${m}m`;
	return `${m}m`;
}

type AuthInfo =
	| { kind: "oauth"; token: string }
	| { kind: "apikey"; key: string }
	| null;

function readAuth(): AuthInfo {
	// 1. 环境变量 ANTHROPIC_API_KEY（普通 API）
	const envKey = process.env.ANTHROPIC_API_KEY;
	if (envKey) return { kind: "apikey", key: envKey };

	// 2. ~/.pi/agent/auth.json
	try {
		const authPath = join(homedir(), ".pi", "agent", "auth.json");
		const auth = JSON.parse(readFileSync(authPath, "utf8"));
		const a = auth?.anthropic;
		if (!a) return null;
		// OAuth 订阅：有 access token
		if (a.access) return { kind: "oauth", token: a.access };
		// 普通 API key
		if (a.key) return { kind: "apikey", key: a.key };
	} catch {
		// ignore
	}
	return null;
}

// ─── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	const state: QuotaState = {
		util5h: null,
		util7d: null,
		reset5h: null,
		reset7d: null,
		status5h: null,
		status7d: null,
		claim: null,
		lastUpdated: null,
	};

	// Parse headers from any Anthropic API response
	function parseHeaders(headers: Record<string, string>) {
		const get = (k: string) => headers[k] ?? headers[k.toLowerCase()] ?? null;

		const u5h = get("anthropic-ratelimit-unified-5h-utilization");
		const u7d = get("anthropic-ratelimit-unified-7d-utilization");
		const r5h = get("anthropic-ratelimit-unified-5h-reset");
		const r7d = get("anthropic-ratelimit-unified-7d-reset");
		const s5h = get("anthropic-ratelimit-unified-5h-status");
		const s7d = get("anthropic-ratelimit-unified-7d-status");
		const claim = get("anthropic-ratelimit-unified-representative-claim");

		if (u5h !== null) state.util5h = parseFloat(u5h);
		if (u7d !== null) state.util7d = parseFloat(u7d);
		if (r5h !== null) state.reset5h = new Date(parseInt(r5h) * 1000);
		if (r7d !== null) state.reset7d = new Date(parseInt(r7d) * 1000);
		if (s5h !== null) state.status5h = s5h;
		if (s7d !== null) state.status7d = s7d;
		if (claim !== null) state.claim = claim;
		state.lastUpdated = new Date();
	}

	// Build the widget line shown below the editor
	function buildWidgetLine(): string {
		if (state.lastUpdated === null) return " Claude quota: loading...";

		const icon5h = statusIcon(state.util5h, state.status5h);
		const p5h = pct(state.util5h);
		const r5h = timeUntil(state.reset5h);

		const icon7d = statusIcon(state.util7d, state.status7d);
		const p7d = pct(state.util7d);
		const r7d = timeUntil(state.reset7d);

		const active = state.claim === "seven_day" ? "★7d" : "★5h";

		const part5h = `${icon5h} 5h:${p5h}${r5h ? " ↺" + r5h : ""}`;
		const part7d = `${icon7d} 7d:${p7d}${r7d ? " ↺" + r7d : ""}`;

		return ` ${part5h}   ${part7d}   ${active}`;
	}

	// ── Intercept every API response ──────────────────────────────────────────
	pi.on("after_provider_response", (event, ctx) => {
		if (!event.headers) return;
		const relevant = Object.keys(event.headers).some((k) =>
			k.startsWith("anthropic-ratelimit-unified"),
		);
		if (!relevant) return;

		parseHeaders(event.headers);
		ctx.ui.setWidget("claude-subs-quota", [buildWidgetLine()], {
			placement: "belowEditor",
		});
	});

	// ── Probe on session start ─────────────────────────────────────────────────
	pi.on("session_start", async (_event, ctx) => {
		const auth = readAuth();
		if (!auth) return;

		// 根据认证类型选择正确的 header
		const authHeaders: Record<string, string> =
			auth.kind === "oauth"
				? { Authorization: `Bearer ${auth.token}` }
				: { "x-api-key": auth.key };

		try {
			const res = await fetch("https://api.anthropic.com/v1/messages", {
				method: "POST",
				headers: {
					...authHeaders,
					"anthropic-version": "2023-06-01",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "claude-haiku-4-5",
					max_tokens: 1,
					messages: [{ role: "user", content: "1" }],
				}),
				signal: AbortSignal.timeout(8000),
			});

			// Extract ratelimit headers regardless of status code
			const headers: Record<string, string> = {};
			res.headers.forEach((v, k) => {
				headers[k] = v;
			});
			parseHeaders(headers);
			ctx.ui.setWidget("claude-subs-quota", [buildWidgetLine()], {
				placement: "belowEditor",
			});
		} catch {
			// Network failure or timeout — silently ignore, will update on next real request
		}
	});

	// ── /quota command ─────────────────────────────────────────────────────────
	pi.registerCommand("quota", {
		description: "Show Claude subscription quota usage",
		handler: async (_args, ctx) => {
			if (state.lastUpdated === null) {
				ctx.ui.notify(
					"Quota data not yet available — send a message first",
					"info",
				);
				return;
			}

			const lines: string[] = [
				"╭─ Claude Subscription Quota ─────────────────",
			];

			// 5-hour window
			const icon5h = statusIcon(state.util5h, state.status5h);
			const bar5h = makeBar(state.util5h);
			const reset5h = timeUntil(state.reset5h);
			lines.push(
				`│ 5h window  ${icon5h} ${bar5h} ${pct(state.util5h).padStart(4)}`,
			);
			if (reset5h) lines.push(`│            ↺ resets in ${reset5h}`);

			// 7-day window
			const icon7d = statusIcon(state.util7d, state.status7d);
			const bar7d = makeBar(state.util7d);
			const reset7d = timeUntil(state.reset7d);
			lines.push(
				`│ 7d window  ${icon7d} ${bar7d} ${pct(state.util7d).padStart(4)}`,
			);
			if (reset7d) lines.push(`│            ↺ resets in ${reset7d}`);

			// Active limit
			if (state.claim) {
				const label = state.claim === "five_hour" ? "5-hour" : "7-day";
				lines.push(`│ Active limit: ${label} window`);
			}

			lines.push(
				`╰─ Updated: ${state.lastUpdated.toLocaleTimeString()} ────────────────`,
			);

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}

// ─── ASCII progress bar ───────────────────────────────────────────────────

function makeBar(util: number | null): string {
	const W = 16;
	if (util === null) return "─".repeat(W);
	const filled = Math.round(util * W);
	return "█".repeat(filled) + "░".repeat(W - filled);
}
