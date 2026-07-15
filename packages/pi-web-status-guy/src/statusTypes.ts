export const CONFIG_PATH = ".pi-web/status.json";
export const RESULT_PATH = ".pi-web/status-result.json";
export const RUNNER_PATH = ".pi-web/status-runner.mjs";
export const FRESH_MS = 600_000;

export type ProbeGroup = "services" | "system" | "network" | "pi";

export interface StatusProbe {
	id: string;
	title: string;
	group: ProbeGroup;
	command: string;
	timeoutMs?: number;
}

export interface StatusConfig {
	version: 1;
	probes: StatusProbe[];
}

export interface ProbeResult {
	id: string;
	title: string;
	group: ProbeGroup;
	ok: boolean | null;
	exitCode: number | null;
	detail: string;
	durationMs: number;
}

export interface StatusResult {
	version: 1;
	collectedAt: string;
	error?: string;
	probes: ProbeResult[];
}

export function parseStatusResult(text: string): StatusResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new Error("status-result 不是合法 JSON");
	}
	const record = parsed as Partial<StatusResult> | null;
	if (record === null || typeof record !== "object" || record.version !== 1 || !Array.isArray(record.probes)) {
		throw new Error("status-result 的 version 必须是 1 且含 probes 数组");
	}
	return record as StatusResult;
}

export function isFresh(collectedAt: string, now: Date = new Date()): boolean {
	const t = Date.parse(collectedAt);
	if (Number.isNaN(t)) return false;
	return now.getTime() - t < FRESH_MS;
}

export function failCount(result: StatusResult): number {
	return result.probes.filter((p) => p.ok !== true).length;
}
