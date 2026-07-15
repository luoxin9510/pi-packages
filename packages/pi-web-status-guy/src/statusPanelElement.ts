import type { WorkspacePanelContext } from "@jmfederico/pi-web/plugin-api";
import { CONFIG_PATH, RESULT_PATH, RUNNER_PATH, isFresh, failCount, parseStatusResult, type ProbeGroup, type ProbeResult, type StatusResult } from "./statusTypes.js";
import { RUNNER_SOURCE } from "./runnerSource.js";

export const statusPanelTagName = "pi-web-status-guy-panel";

const resultChangedEvent = "pi-web-status-guy-result-changed";

type PanelState =
	| { kind: "loading" }
	| { kind: "missing" }
	| { kind: "collecting" }
	| { kind: "loaded"; result: StatusResult; refreshing: boolean }
	| { kind: "error"; message: string; refreshing: boolean };

const stateCache = new Map<string, PanelState>();

const GROUP_TITLES: Record<ProbeGroup, string> = {
	services: "核心服务",
	system: "系统资源",
	network: "网络面",
	pi: "pi 会话面",
};

export function defineStatusPanelElement(): void {
	if (!customElements.get(statusPanelTagName)) customElements.define(statusPanelTagName, StatusGuyPanel);
}

export function statusPanelBadge(context: WorkspacePanelContext): string | undefined {
	const state = stateCache.get(cacheKey(context));
	if (state === undefined || state.kind !== "loaded") return undefined;
	const failures = failCount(state.result);
	return failures > 0 ? String(failures) : undefined;
}

class StatusGuyPanel extends HTMLElement {
	private contextValue: WorkspacePanelContext | undefined;
	private readonly root: ShadowRoot;
	private readonly onResultChanged = () => {
		this.render();
	};

	constructor() {
		super();
		this.root = this.attachShadow({ mode: "open" });
	}

	set context(value: WorkspacePanelContext | undefined) {
		const previousKey = this.contextValue === undefined ? undefined : cacheKey(this.contextValue);
		const nextKey = value === undefined ? undefined : cacheKey(value);
		this.contextValue = value;
		if (previousKey === nextKey) return;
		this.render();
		if (value !== undefined) void this.loadResult(value);
	}

	connectedCallback(): void {
		window.addEventListener(resultChangedEvent, this.onResultChanged);
		this.render();
		if (this.contextValue !== undefined && stateCache.get(cacheKey(this.contextValue)) === undefined) {
			void this.loadResult(this.contextValue);
		}
	}

	disconnectedCallback(): void {
		window.removeEventListener(resultChangedEvent, this.onResultChanged);
	}

	private async loadResult(context: WorkspacePanelContext): Promise<void> {
		setState(context, { kind: "loading" });
		try {
			const file = await context.files.readFile(RESULT_PATH);
			const result = parseStatusResult(file.content);
			setState(context, { kind: "loaded", result, refreshing: false });
		} catch {
			setState(context, { kind: "missing" });
		}
	}

	private async refresh(): Promise<void> {
		const context = this.contextValue;
		if (context === undefined) return;
		const current = stateCache.get(cacheKey(context));
		if (current?.kind === "collecting") return;
		if (current !== undefined && "refreshing" in current && current.refreshing) return;
		if (current?.kind === "loaded") setState(context, { ...current, refreshing: true });
		else setState(context, { kind: "collecting" });
		try {
			await context.files.writeFile(RUNNER_PATH, RUNNER_SOURCE);
			const handle = await context.terminal.runCommand({
				title: "status-guy refresh",
				command: "node " + RUNNER_PATH,
				open: false,
				metadata: { "pi.plugin": "status-guy" },
			});
			await handle.completed;
			await this.loadResult(context);
		} catch (error) {
			setState(context, { kind: "error", message: error instanceof Error ? error.message : String(error), refreshing: false });
		}
	}

	private render(): void {
		const context = this.contextValue;
		if (context === undefined) {
			this.root.innerHTML = `<section class="viewer"><p class="muted">未选中 workspace。</p></section>`;
			return;
		}
		const state = stateCache.get(cacheKey(context)) ?? { kind: "loading" as const };
		this.root.innerHTML = `<style>${PANEL_CSS}</style>${renderState(state)}`;
		const button = this.root.querySelector("button[data-action=refresh]");
		if (button !== null) button.addEventListener("click", () => void this.refresh());
	}
}

function setState(context: WorkspacePanelContext, state: PanelState): void {
	stateCache.set(cacheKey(context), state);
	context.host.requestRender();
	window.dispatchEvent(new Event(resultChangedEvent));
}

function cacheKey(context: WorkspacePanelContext): string {
	return `${context.machine.id}:${context.workspace.projectId}:${context.workspace.id}`;
}

function renderState(state: PanelState): string {
	if (state.kind === "loading") return `<section class="viewer"><p class="muted">读取上次采集结果……</p></section>`;
	if (state.kind === "collecting") return `<section class="viewer"><p class="muted">正在采集……</p>${refreshButton(true)}</section>`;
	if (state.kind === "missing") {
		return `<section class="viewer"><p><strong>还没有采集结果</strong></p><p class="muted">确认 workspace 里有 ${escapeHtml(CONFIG_PATH)},然后点击刷新。</p>${refreshButton(false)}</section>`;
	}
	if (state.kind === "error") {
		return `<section class="viewer"><p><strong>出错了</strong></p><p class="muted">${escapeHtml(state.message)}</p>${refreshButton(state.refreshing)}</section>`;
	}
	const { result, refreshing } = state;
	const stale = !isFresh(result.collectedAt);
	const header = `<p class="muted">采集于 ${escapeHtml(agoLabel(result.collectedAt))}${stale ? "(已过期)" : ""}</p>`;
	const errorBanner = result.error !== undefined ? `<p class="bad">runner 报错:${escapeHtml(result.error)}</p>` : "";
	const groups = (Object.keys(GROUP_TITLES) as ProbeGroup[])
		.map((group) => renderGroup(group, result.probes.filter((probe) => probe.group === group)))
		.join("");
	return `<section class="viewer">${header}${errorBanner}${refreshButton(refreshing)}${groups}</section>`;
}

function renderGroup(group: ProbeGroup, probes: ProbeResult[]): string {
	if (probes.length === 0) return "";
	const rows = probes
		.map((probe) => `<li><span class="${cssClass(probe.ok)}">${symbol(probe.ok)}</span> <strong>${escapeHtml(probe.title)}</strong> <span class="muted">${escapeHtml(probe.detail)}</span></li>`)
		.join("");
	return `<h3>${GROUP_TITLES[group]}</h3><ul>${rows}</ul>`;
}

function refreshButton(refreshing: boolean): string {
	return `<p><button data-action="refresh" ${refreshing ? "disabled" : ""}>${refreshing ? "采集中……" : "刷新"}</button></p>`;
}

function symbol(ok: boolean | null): string {
	if (ok === true) return "✓";
	if (ok === false) return "✗";
	return "⚠";
}

function cssClass(ok: boolean | null): string {
	if (ok === true) return "good";
	if (ok === false) return "bad";
	return "warn";
}

function agoLabel(collectedAt: string): string {
	const t = Date.parse(collectedAt);
	if (Number.isNaN(t)) return "未知时间";
	const minutes = Math.max(0, Math.round((Date.now() - t) / 60_000));
	return minutes === 0 ? "刚刚" : `${minutes} 分钟前`;
}

function escapeHtml(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const PANEL_CSS = `
.viewer { padding: 0.75rem; font: 13px/1.5 system-ui, sans-serif; }
.muted { opacity: 0.65; }
.good { color: #2da44e; }
.bad { color: #cf222e; }
.warn { color: #bf8700; }
h3 { margin: 0.75rem 0 0.25rem; font-size: 12px; text-transform: none; opacity: 0.8; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: 2px 0; }
button { cursor: pointer; }
button[disabled] { cursor: wait; opacity: 0.6; }
`;
