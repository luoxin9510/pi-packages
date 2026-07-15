# pi-web-status-guy 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建成 `packages/pi-web-status-guy`——配置驱动的 pi-web workspace 状态面板插件,最终部署到用户 VPS(pi-web 1.202607.0),手机浏览器可见真实四组状态。

**Architecture:** 三块:runner(`.mjs` 落盘脚本,execSync 跑探测写结果 JSON)、面板(自定义元素 + 模块级缓存 + `host.requestRender()`,照官方 workspace-tasks 架构)、配置(workspace 的 `.pi-web/status.json`)。数据经文件交接(`runCommand` 拿不到 stdout)。

**Tech Stack:** TypeScript(tsc 编译出 dist,**本仓库首个编译包**)、pi-web 稳定 plugin API(apiVersion 1)、node:test(`--experimental-strip-types`)、零第三方运行时依赖。

**Spec:** `docs/superpowers/specs/2026-07-15-pi-web-status-guy-design.md`(已批准,两轮审核通过)。实施者遇细节冲突以 spec 为准。

## Global Constraints

- 仓库:`~/Developer/pi-packages`,分支 `main`,npm workspaces(`packages/*`)。
- API 参照:`~/Developer/pi-web` @ `a857fe4e`(= 部署版 1.202607.0)。只用稳定 plugin API(`plugin-api.d.ts`),不碰 `unstable`。
- 官方样本:入口契约照 `pi-web-plugins/info/pi-web-plugin.ts`(default export `PiWebPlugin{apiVersion:1, name, activate({pluginId, html, svg}) => {contributions}}`);面板元素照 `pi-web-plugins/workspace-tasks/tasksPanelElement.ts`(shadowRoot + `innerHTML` 字符串渲染 + `escapeHtml`,模块级 `Map` 缓存,`context.host.requestRender()`)。
- manifest = 包自己的 `package.json`,含 `"piWeb": {"plugins": [{"id": "status-guy", "module": "dist/pi-web-plugin.js"}]}`;浏览器只认编译后 `.js`。
- 数据契约(spec §4):配置 `.pi-web/status.json`,结果 `.pi-web/status-result.json`,runner 落盘 `.pi-web/status-runner.mjs`;group 枚举 `services|system|network|pi`;`ok: true|false|null`(null=超时/杀死);新鲜阈值 10 分钟。
- runner:`execSync(probe.command, { shell: "/bin/bash", timeout: p.timeoutMs ?? 10_000 })`;探测命令只读;配置/结果里禁止密钥。
- 测试:`node --experimental-strip-types --test packages/pi-web-status-guy/test/*.test.ts`(node:test,直接 import `.ts`,与 pi-critic-guy 同款);类型检查 `npx tsc -p packages/pi-web-status-guy`。
- 每个 Task 结束 commit(中文,`feat(status-guy): ...` 风格)。VPS 只在 Task 5 碰,且只新增插件目录与项目配置文件。

---

### Task 1: 包骨架 + statusTypes 纯逻辑(TDD)

**Files:**
- Create: `packages/pi-web-status-guy/package.json`
- Create: `packages/pi-web-status-guy/tsconfig.json`
- Create: `packages/pi-web-status-guy/src/statusTypes.ts`
- Test: `packages/pi-web-status-guy/test/statusTypes.test.ts`
- Modify: `package.json`(根,check 脚本加本包)

**Interfaces:**
- Produces(后续任务照抄这些名字):常量 `CONFIG_PATH=".pi-web/status.json"`、`RESULT_PATH=".pi-web/status-result.json"`、`RUNNER_PATH=".pi-web/status-runner.mjs"`、`FRESH_MS=600_000`;类型 `StatusProbe{id,title,group,command,timeoutMs?}`、`StatusConfig{version:1,probes:StatusProbe[]}`、`ProbeResult{id,title,group,ok:boolean|null,exitCode:number|null,detail:string,durationMs:number}`、`StatusResult{version:1,collectedAt:string,error?:string,probes:ProbeResult[]}`;函数 `parseStatusResult(text: string): StatusResult`(JSON 非法/version≠1 时 throw `Error`,message 为人话)、`isFresh(collectedAt: string, now?: Date): boolean`、`failCount(result: StatusResult): number`(统计 `ok !== true` 的项数)。

- [ ] **Step 1: 建包骨架**

`packages/pi-web-status-guy/package.json`:

```json
{
  "name": "@nukcole-xinluo9510/pi-web-status-guy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Config-driven server status panel plugin for PI WEB — define probes in .pi-web/status.json, see ✓/✗ at a glance.",
  "piWeb": {
    "plugins": [
      { "id": "status-guy", "module": "dist/pi-web-plugin.js" }
    ]
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc -p ."
  },
  "devDependencies": {
    "@jmfederico/pi-web": "^1.202607.0"
  }
}
```

`packages/pi-web-status-guy/tsconfig.json`(本仓库首个需要产物的包,根 tsconfig 是 `noEmit: true`,这里显式覆盖):

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": false
  },
  "include": ["src"]
}
```

根 `package.json` 的 `check` 脚本(硬编码逐包列举,不会自动覆盖新包)追加本包:

```
"check": "tsc -p packages/pi-critic-guy && tsc -p packages/pi-claude-subs-quota && tsc -p packages/pi-write-coach && tsc -p packages/pi-extension-guy && tsc -p packages/pi-fun-working && tsc -p packages/pi-web-status-guy"
```

然后 `npm install`(workspace 安装 `@jmfederico/pi-web` 类型依赖)。

- [ ] **Step 2: 写失败测试**

`packages/pi-web-status-guy/test/statusTypes.test.ts`:

```ts
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
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd ~/Developer/pi-packages && node --experimental-strip-types --test packages/pi-web-status-guy/test/statusTypes.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 4: 实现 statusTypes.ts**

```ts
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `node --experimental-strip-types --test packages/pi-web-status-guy/test/statusTypes.test.ts`
Expected: 全部 pass,输出干净。再跑 `npm run check`(根)确认新包 tsc 通过且没弄坏其余五包。

- [ ] **Step 6: Commit**

```bash
git add packages/pi-web-status-guy package.json package-lock.json
git commit -m "feat(status-guy): 包骨架与数据契约纯逻辑(仓库首个编译包)"
```

---

### Task 2: runner 源码 + 真实行为测试(TDD)

**Files:**
- Create: `packages/pi-web-status-guy/src/runnerSource.ts`
- Test: `packages/pi-web-status-guy/test/runner.test.ts`

**Interfaces:**
- Consumes: Task 1 的类型(仅文档意义;runner 是独立 `.mjs`,不 import TS)。
- Produces: `export const RUNNER_SOURCE: string`——完整 `.mjs` 源码字符串。面板(Task 3)将把它 `files.writeFile` 到 `RUNNER_PATH`。**注意:字符串常量用模板字面量包裹,runner 源码内不得出现反引号与 `${`(必要时用字符串拼接),避免嵌套转义。**

- [ ] **Step 1: 写失败测试(spawn 真 node 跑 runner,断言真实行为)**

`packages/pi-web-status-guy/test/runner.test.ts`:

```ts
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --experimental-strip-types --test packages/pi-web-status-guy/test/runner.test.ts`
Expected: FAIL(runnerSource 不存在)。

- [ ] **Step 3: 实现 runnerSource.ts**

```ts
// runner 以独立 .mjs 落盘执行(spec §3.1:不用 node -e,绕开 shell 引号嵌套)。
// 约束:本字符串内不得出现反引号或 ${,否则嵌套转义地狱回归。
export const RUNNER_SOURCE: string = [
	'import { readFileSync, writeFileSync } from "node:fs";',
	'import { execSync } from "node:child_process";',
	'',
	'const CONFIG = ".pi-web/status.json";',
	'const RESULT = ".pi-web/status-result.json";',
	'',
	'function firstLine(value) {',
	'  if (value === undefined || value === null) return "";',
	'  return value.toString().split("\\n")[0].slice(0, 120);',
	'}',
	'',
	'const probes = [];',
	'let error;',
	'try {',
	'  const config = JSON.parse(readFileSync(CONFIG, "utf8"));',
	'  if (config === null || config.version !== 1 || !Array.isArray(config.probes)) {',
	'    throw new Error("status.json: version must be 1 with a probes array");',
	'  }',
	'  for (const probe of config.probes) {',
	'    const started = Date.now();',
	'    let ok = null;',
	'    let exitCode = null;',
	'    let detail = "";',
	'    try {',
	'      const stdout = execSync(probe.command, {',
	'        shell: "/bin/bash",',
	'        timeout: probe.timeoutMs ?? 10000,',
	'        stdio: ["ignore", "pipe", "pipe"],',
	'      });',
	'      ok = true;',
	'      exitCode = 0;',
	'      detail = firstLine(stdout);',
	'    } catch (err) {',
	'      if (err.signal) {',
	'        ok = null;',
	'        detail = "timeout/killed (" + err.signal + ")";',
	'      } else {',
	'        ok = false;',
	'        exitCode = typeof err.status === "number" ? err.status : null;',
	'        detail = firstLine(err.stderr) || firstLine(err.stdout) || firstLine(err.message);',
	'      }',
	'    }',
	'    probes.push({ id: probe.id, title: probe.title, group: probe.group, ok, exitCode, detail, durationMs: Date.now() - started });',
	'  }',
	'} catch (err) {',
	'  error = err instanceof Error ? err.message : String(err);',
	'}',
	'',
	'const result = { version: 1, collectedAt: new Date().toISOString(), probes };',
	'if (error !== undefined) result.error = error;',
	'writeFileSync(RESULT, JSON.stringify(result, null, 2));',
	'if (error !== undefined) process.exit(1);',
	'',
].join("\n");
```

(注意 `firstLine` 里换行分隔符写成 `"\\n"`——它要在生成的 .mjs 里成为 `"\n"`。)

- [ ] **Step 4: 跑测试确认通过**

Run: `node --experimental-strip-types --test packages/pi-web-status-guy/test/runner.test.ts`
Expected: 7/7 pass。失败探测的 detail 语义:**stderr 优先于 stdout**(错误场景下 stderr 更有信息量)。

- [ ] **Step 5: Commit**

```bash
git add packages/pi-web-status-guy/src/runnerSource.ts packages/pi-web-status-guy/test/runner.test.ts
git commit -m "feat(status-guy): runner 落盘源码与真实行为测试(成功/失败/超时/bash语义/截断/坏配置)"
```

---

### Task 3: 面板元素 + 插件入口 + 构建产物

**Files:**
- Create: `packages/pi-web-status-guy/src/statusPanelElement.ts`
- Create: `packages/pi-web-status-guy/src/pi-web-plugin.ts`
- Test: 无新增自动化测试(元素依赖浏览器 DOM/宿主,行为验证在 Task 4 dev 实例;可测纯逻辑已在 Task 1/2 覆盖)。验证 = `npm run build` 产物 + `npm run check` 通过。

**Interfaces:**
- Consumes: Task 1 全部导出;Task 2 的 `RUNNER_SOURCE`。
- Produces: `dist/pi-web-plugin.js`(manifest `module` 指向它);自定义元素 tag `pi-web-status-guy-panel`;`statusPanelBadge(context): string | undefined`。

- [ ] **Step 1: 实现 statusPanelElement.ts**(架构逐条照 workspace-tasks 先例:模块级缓存 / shadowRoot innerHTML / requestRender;含中文分组标题与全部错误态)

```ts
import type { WorkspacePanelContext } from "@jmfederico/pi-web/plugin-api";
import { CONFIG_PATH, RESULT_PATH, RUNNER_PATH, isFresh, failCount, parseStatusResult, type ProbeGroup, type ProbeResult, type StatusResult } from "./statusTypes.js";
import { RUNNER_SOURCE } from "./runnerSource.js";

export const statusPanelTagName = "pi-web-status-guy-panel";

const resultChangedEvent = "pi-web-status-guy-result-changed";

type PanelState =
	| { kind: "loading" }
	| { kind: "missing" }
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
		if (current !== undefined && "refreshing" in current && current.refreshing) return;
		if (current?.kind === "loaded") setState(context, { ...current, refreshing: true });
		else setState(context, { kind: "error", message: "正在采集……", refreshing: true });
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
```

- [ ] **Step 2: 实现 pi-web-plugin.ts(入口,契约照 info/workspace-tasks)**

```ts
import type { PiWebPlugin } from "@jmfederico/pi-web/plugin-api";
import { defineStatusPanelElement, statusPanelBadge, statusPanelTagName } from "./statusPanelElement.js";

const plugin: PiWebPlugin = {
	apiVersion: 1,
	name: "Status Guy",
	activate: ({ html, svg }) => {
		defineStatusPanelElement();
		return {
			contributions: {
				workspacePanels: [
					{
						id: "workspace.status",
						title: "Status",
						icon: svg`
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 12h4l2 -7 4 14 2 -7h6"></path>
							</svg>
						`,
						order: 60,
						badge: (context) => statusPanelBadge(context),
						render: (context) => html`<pi-web-status-guy-panel .context=${context}></pi-web-status-guy-panel>`,
					},
				],
			},
		};
	},
};

export default plugin;
```

(注:模板里的自定义元素名与 `statusPanelTagName` 常量一致;若 tsc 报 `statusPanelTagName` 未使用,把 render 里的标签名改为插值不可行——lit 静态标签必须字面量——保留 import 并在文件顶部 `void statusPanelTagName;` 或直接去掉该 import,取舍交给实施时的 lint 现实。)

- [ ] **Step 3: 构建 + 类型检查**

Run: `cd ~/Developer/pi-packages && npm run build --workspace @nukcole-xinluo9510/pi-web-status-guy && npm run check && npm test`
Expected: `packages/pi-web-status-guy/dist/` 出现 `pi-web-plugin.js`、`statusPanelElement.js`、`statusTypes.js`、`runnerSource.js`;check 六包全绿;既有测试 + 本包测试全过。

- [ ] **Step 4: Commit**

```bash
git add packages/pi-web-status-guy/src packages/pi-web-status-guy/test
git commit -m "feat(status-guy): 面板元素(缓存+requestRender)与插件入口,dist 构建通过"
```

---

### Task 4: Mac dev 实例验证(先最小 spike,后全链路)

**Files:**
- Create: `~/Developer/pi-web-plugin-lab/status-guy-e2e/`(实验 workspace,vault/repo 外)
- 无仓库代码变更预期;若 spike 暴露缺陷则修复对应 src 文件并补测试

**Interfaces:**
- Consumes: Task 3 的 `dist/` 产物 + 包 `package.json`(manifest)。
- Produces: 验证证据(写进 `packages/pi-web-status-guy/README.md` 的"验证记录"小节,Task 5 一并提交)。

- [ ] **Step 1: 起 dev 实例并挂载插件**(照 pi-agent-study「实战 · 从零写一个 pi-web plugin」lab 流程)

```bash
mkdir -p ~/Developer/pi-web-plugin-lab/data/plugins ~/Developer/pi-web-plugin-lab/status-guy-e2e/.pi-web
ln -sfn ~/Developer/pi-packages/packages/pi-web-status-guy ~/Developer/pi-web-plugin-lab/data/plugins/status-guy
cd ~/Developer/pi-web && PI_WEB_DATA_DIR=~/Developer/pi-web-plugin-lab/data npm run dev
```

前台跑;后续步骤另开终端。浏览器/HTTP 确认 `pi-web-plugins/manifest.json` 里出现 `{"id":"status-guy",...}` 且 module URL 能取到编译后 JS。

- [ ] **Step 2: 最小 spike——单验全库无先例链路**(spec §7 硬性要求)

实验 workspace 写入单探测配置 `~/Developer/pi-web-plugin-lab/status-guy-e2e/.pi-web/status.json`:

```json
{ "version": 1, "probes": [{ "id": "spike", "title": "Spike", "group": "system", "command": "echo spike-ok" }] }
```

在 dev 实例 UI 中把该目录加为 workspace,打开 Status 面板点刷新。**验收链路逐环取证**:`open:false` 的 runCommand 发出(Network 面板或 server 日志)→ `handle.completed` 落定 → `.pi-web/status-result.json` 落盘且含 `"detail": "spike-ok"` → 面板渲染出 ✓ 行。任何一环不通,先修这一环再继续。

- [ ] **Step 3: 全链路场景**(在同一 workspace 扩展配置)

配置换成覆盖四组 + 三种状态:

```json
{ "version": 1, "probes": [
  { "id": "ok", "title": "会成功", "group": "services", "command": "echo fine" },
  { "id": "fail", "title": "会失败", "group": "system", "command": "exit 2" },
  { "id": "slow", "title": "会超时", "group": "network", "command": "sleep 5", "timeoutMs": 500 },
  { "id": "pi", "title": "node 版本", "group": "pi", "command": "node --version" }
] }
```

逐项核对:四组标题齐、✓/✗/⚠ 各就位、badge 显示 2、"采集于 刚刚"、刷新中按钮禁用、删掉 status.json 后刷新 → 面板显示 runner 报错而非空白。

- [ ] **Step 4: 清理 + 记录**

Ctrl-C 停 dev,`rm ~/Developer/pi-web-plugin-lab/data/plugins/status-guy`(symlink),`pgrep -f pi-web` 确认干净,`git -C ~/Developer/pi-web status --short` 确认无污染。证据(每步命令与观察)暂记到 `.superpowers/sdd/` 报告,README 验证记录小节由 Task 5 落笔。若本任务修了 src,单独 commit:`fix(status-guy): dev 实例验证暴露的 <问题>`。

---

### Task 5: VPS 探测定稿 + 部署 + 手机验收 + README

**Files:**
- Create: `packages/pi-web-status-guy/README.md`
- Create(VPS): `$PI_WEB_DATA_DIR/plugins/status-guy/`(插件目录)、目标 workspace 的 `.pi-web/status.json`
- Modify(VPS,可选): 目标 workspace 若是 git 仓库,其 `.gitignore` 追加 `.pi-web/status-result.json` 与 `.pi-web/status-runner.mjs`

**Interfaces:**
- Consumes: Task 3 dist、Task 4 验证结论。
- Produces: VPS 上线的插件 + 真实配置;README(用法 + 配置契约 + 已知限制 + 验证记录)。

- [ ] **Step 1: SSH 只读发现探测事实**(spec §6:pi-web 双服务/x-ui/tailscale 无现成文档,从零确认)

```bash
~/Developer/vps-setup/vps-ssh.sh 'bash -lc "export XDG_RUNTIME_DIR=/run/user/0; systemctl --user list-units --no-pager | head; systemctl list-units --type=service --no-pager | grep -iE \"x-ui|xray|rclone\"; docker ps --format \"{{.Names}} {{.Status}}\"; tailscale status --peers=false 2>&1 | head -3; cat ~/.pi-web/projects.json 2>/dev/null | head -40; echo NODE=$(node --version)"'
```

记录:确切服务名、docker 容器名、tailscale 输出形态、**现有 workspace 列表(决定配置放哪个 workspace——选用户日常用的那个;projects.json 为空则先在 UI 建一个,与用户确认目录)**。

- [ ] **Step 2: 逐条实测探测命令**(只读;pi 组两条是进程树内省,单列试错)

在 SSH 里逐条跑、按输出定稿,初稿(按 Step 1 实测修正服务名/容器名):

```bash
# services
XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user is-active pi-web.service pi-web-sessiond.service
systemctl is-active x-ui.service
docker inspect -f '{{.State.Status}}' audiobookshelf
systemctl is-active rclone-podcast.service
# system
df -h / | awk 'NR==2{print $5" used, "$4" free"}'
free -h | awk 'NR==2{print $3" / "$2}'
uptime | sed 's/.*load average/load/'
# network
tailscale status --peers=false | head -1
ss -ltn "( sport = :443 or sport = :8443 )" | tail -n +2 | wc -l   # 期望 2
curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://pod.xinsawi.com
# pi(进程树内省,允许多轮试错)
pgrep -P $(systemctl --user show -p MainPID --value pi-web-sessiond.service) | wc -l
ps -o rss= -p $(systemctl --user show -p MainPID --value pi-web-sessiond.service) | awk '{printf "%.0f MB", $1/1024}'
```

每条按真实输出决定去留/改写;`curl` 返回非 200 时用 `test` 包装成非零退出(如 `test "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 https://pod.xinsawi.com)" = 200`)。**pi 组注意**:探测命令由 runner 经 bash 子进程执行,`systemctl --user` 同样需要 `XDG_RUNTIME_DIR` 前缀(terminal 由 sessiond 的 user 环境 spawn,但显式加前缀最稳)。

- [ ] **Step 3: 部署插件到 VPS**

```bash
cd ~/Developer/pi-packages/packages/pi-web-status-guy && npm run build
tar czf /tmp/status-guy.tgz package.json dist README.md
~/Developer/vps-setup/vps-ssh.sh 'mkdir -p ~/.pi-web/plugins/status-guy'
scp 用 vps-ssh.sh 同款参数(读 vps-setup/.env 的密钥与主机)把 tgz 传上去并解包到 ~/.pi-web/plugins/status-guy/
~/Developer/vps-setup/vps-ssh.sh 'ls ~/.pi-web/plugins/status-guy/dist/pi-web-plugin.js'
```

(VPS `PI_WEB_DATA_DIR` 未设,默认 `~/.pi-web`——Task 1 的 vps-facts 已核实其 config 在 `~/.config/pi-web`,数据目录走默认。)本地插件发现带 mtime cache-buster,无需重启服务;浏览器刷新即可。

- [ ] **Step 4: 写入目标 workspace 的真实配置**(Step 2 定稿内容,含 `XDG_RUNTIME_DIR` 前缀与 `test` 包装;若 workspace 是 git 仓库,追加 .gitignore 两行)并在自己浏览器先验:面板出现、刷新后四组真实状态、badge 正确。

- [ ] **Step 5: 用户手机验收(验收标准,须用户确认)**

请用户在手机 Tailscale 环境打开 `http://100.72.216.2:8504`,进目标 workspace 的 Status 面板。**用户回复"看到了"才算过**;有问题记录现象修复重验。

- [ ] **Step 6: README + 收尾提交**

`packages/pi-web-status-guy/README.md`:一句话定位、安装(local 插件目录)、配置契约(§4 两个 JSON 的字段表 + group 枚举)、刷新语义(手动、10 分钟新鲜阈值)、已知限制(每次刷新留一条已退出终端记录,Terminals 面板可清理)、验证记录(Task 4 dev 实例证据 + Task 5 VPS/手机验收,含日期与 pi-web 版本)。

```bash
git add packages/pi-web-status-guy/README.md
git commit -m "feat(status-guy): README 与 VPS 上线验证记录"
git push origin main
```
