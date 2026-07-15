import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseStatusResult, isFresh, failCount, CONFIG_PATH, RESULT_PATH, RUNNER_PATH } from "../src/statusTypes.ts";

describe("常量", () => {
	it("路径常量与 spec §4 契约一致", () => {
		assert.equal(CONFIG_PATH, ".pi-web/status.json");
		assert.equal(RESULT_PATH, ".pi-web/status-result.json");
		assert.equal(RUNNER_PATH, ".pi-web/status-runner.mjs");
	});
});

describe("parseStatusResult", () => {
	it("解析合法结果", () => {
		const r = parseStatusResult(JSON.stringify({
			version: 1, collectedAt: "2026-07-15T12:00:00.000Z",
			probes: [{ id: "a", title: "A", group: "services", ok: true, exitCode: 0, detail: "active", durationMs: 12 }],
		}));
		assert.equal(r.probes.length, 1);
		assert.equal(r.probes[0].ok, true);
	});
	it("JSON 非法 → 人话报错", () => {
		assert.throws(() => parseStatusResult("not json"), /JSON/);
	});
	it("version 不是 1 → 报错", () => {
		assert.throws(() => parseStatusResult(JSON.stringify({ version: 2, collectedAt: "", probes: [] })), /version/);
	});
});

describe("isFresh", () => {
	const now = new Date("2026-07-15T12:00:00.000Z");
	it("9 分钟前 → 新鲜", () => {
		assert.equal(isFresh("2026-07-15T11:51:00.000Z", now), true);
	});
	it("11 分钟前 → 过期", () => {
		assert.equal(isFresh("2026-07-15T11:49:00.000Z", now), false);
	});
	it("非法时间串 → 过期(不抛异常)", () => {
		assert.equal(isFresh("garbage", now), false);
	});
});

describe("failCount", () => {
	it("ok!==true 都算失败(false 与 null)", () => {
		const r = parseStatusResult(JSON.stringify({
			version: 1, collectedAt: "2026-07-15T12:00:00.000Z",
			probes: [
				{ id: "a", title: "A", group: "services", ok: true, exitCode: 0, detail: "", durationMs: 1 },
				{ id: "b", title: "B", group: "system", ok: false, exitCode: 3, detail: "", durationMs: 1 },
				{ id: "c", title: "C", group: "network", ok: null, exitCode: null, detail: "timeout", durationMs: 1 },
			],
		}));
		assert.equal(failCount(r), 2);
	});
});
