import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RUNNER_SOURCE } from "../src/runnerSource.ts";
import { parseStatusResult, CONFIG_PATH, RESULT_PATH, RUNNER_PATH } from "../src/statusTypes.ts";

function setup(config: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), "status-guy-"));
	mkdirSync(join(dir, ".pi-web"), { recursive: true });
	if (config !== undefined) writeFileSync(join(dir, CONFIG_PATH), JSON.stringify(config));
	writeFileSync(join(dir, RUNNER_PATH), RUNNER_SOURCE);
	return dir;
}

function runRunner(dir: string): { exitCode: number } {
	try {
		execFileSync(process.execPath, [RUNNER_PATH], { cwd: dir, stdio: "pipe" });
		return { exitCode: 0 };
	} catch (error) {
		const status = (error as { status?: number }).status;
		return { exitCode: typeof status === "number" ? status : -1 };
	}
}

describe("runner", () => {
	it("成功探测:ok=true,detail=stdout 首行", () => {
		const dir = setup({ version: 1, probes: [{ id: "hi", title: "Hi", group: "system", command: "echo hello && echo second" }] });
		const { exitCode } = runRunner(dir);
		assert.equal(exitCode, 0);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.equal(result.probes[0].ok, true);
		assert.equal(result.probes[0].exitCode, 0);
		assert.equal(result.probes[0].detail, "hello");
	});

	it("失败探测:ok=false,exitCode 保留,detail 取 stderr/stdout 首行", () => {
		const dir = setup({ version: 1, probes: [{ id: "bad", title: "Bad", group: "services", command: "echo oops >&2; exit 3" }] });
		runRunner(dir);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.equal(result.probes[0].ok, false);
		assert.equal(result.probes[0].exitCode, 3);
		assert.match(result.probes[0].detail, /oops/);
	});

	it("超时探测:ok=null", () => {
		const dir = setup({ version: 1, probes: [{ id: "slow", title: "Slow", group: "network", command: "sleep 5", timeoutMs: 300 }] });
		runRunner(dir);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.equal(result.probes[0].ok, null);
	});

	it("bash 语义可用:变量前缀赋值 + $() 命令替换", () => {
		const dir = setup({ version: 1, probes: [{ id: "bash", title: "Bash", group: "system", command: "FOO=$(echo bar) bash -c 'echo $FOO'" }] });
		runRunner(dir);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.equal(result.probes[0].ok, true);
		assert.equal(result.probes[0].detail, "bar");
	});

	it("detail 截断到 120 字符", () => {
		const dir = setup({ version: 1, probes: [{ id: "long", title: "Long", group: "system", command: "printf 'x%.0s' {1..300}" }] });
		runRunner(dir);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.equal(result.probes[0].detail.length, 120);
	});

	it("配置缺失:runner 非零退出,结果文件含 error 且 probes 为空", () => {
		const dir = setup(undefined);
		const { exitCode } = runRunner(dir);
		assert.notEqual(exitCode, 0);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.ok(result.error !== undefined && result.error.length > 0);
		assert.equal(result.probes.length, 0);
	});

	it("多探测项顺序执行,全部落进结果", () => {
		const dir = setup({ version: 1, probes: [
			{ id: "a", title: "A", group: "services", command: "true" },
			{ id: "b", title: "B", group: "pi", command: "false" },
		] });
		runRunner(dir);
		const result = parseStatusResult(readFileSync(join(dir, RESULT_PATH), "utf8"));
		assert.deepEqual(result.probes.map((p) => [p.id, p.ok]), [["a", true], ["b", false]]);
		assert.ok(!Number.isNaN(Date.parse(result.collectedAt)));
	});
});
