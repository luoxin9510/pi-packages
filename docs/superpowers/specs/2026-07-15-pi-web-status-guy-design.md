# status-guy:pi-web VPS 状态面板插件(spec)

- 日期:2026-07-15
- 状态:已获用户批准(方案一:配置驱动的通用探测面板)
- 归属:本 monorepo `packages/pi-web-status-guy`(与 pi-critic-guy 等同族;注意它是 **pi-web plugin**,不是 pi extension)
- 目标运行环境:用户 Hetzner VPS 上的 pi-web `1.202607.0`(2026-07-15 已升级并验证);本机开发验证用 `~/Developer/pi-web` 检出(commit `a857fe4e`,与部署版本一致)

## 1. 目标

一个**配置驱动**的 pi-web workspace 面板插件:监控项定义在项目文件 `.pi-web/status.json`,面板一键刷新后分组展示 VPS 健康状态(✓/✗/⚠ + 一行详情)。用户日常从手机浏览器(Tailscale → pi-web UI)瞟一眼即可知道核心服务、系统资源、网络面、pi 会话面四组状态。改监控项 = 改配置文件,零代码。

## 2. 已核实的 API 事实(依据 `~/Developer/pi-web` @ a857fe4e = 部署版 1.202607.0)

实现只依赖以下**稳定**插件 API(`src/plugin-api.ts`,发布为 `plugin-api.d.ts`;不碰 `unstable.d.ts`):

- `WorkspacePanelContribution`:`{id, title, icon?, order?, visible?, badge?, render(context)}`(`src/plugin-api.ts:182-190`)。**注意 `render` 与 `badge` 都是同步签名**(返回 `TemplateResult` / 值,不接受 Promise)——不能在其中 `await files.readFile`。可行架构见 §3.2。
- `WorkspacePanelContext` = `WorkspaceContext{machine, workspace, state?, files, host}` + `prompt` + `terminal`(`:176-178`)
- `terminal.runCommand(input) → Promise<TerminalCommandRunHandle>`(`:172`);入参 `WorkspaceTerminalCommandInput = {title, command, metadata?, open?}`(`:163-168`,**没有 terminalId 复用字段**);`TerminalCommandRunHandle = {run, completed: Promise<TerminalCommandRun>}`(`src/shared/apiTypes.ts:564-567`),`TerminalCommandRun`(`:540-554`)含 `status/exitCode` 等字段但**没有 stdout**——这就是为什么结果必须经文件交接,而不是直接取命令输出
- `command` 字符串会被原样拼进 `pty.spawn(shell, ["-lc", …])` 执行的脚本(`src/server/terminals/terminalService.ts:278-280` 的 `commandRunShellScript()`),即 command 本身以登录 shell 语义解释,不做二次转义
- `files.readFile(path)` / `files.writeFile(path, content)`(`WorkspaceFiles`,local 与 federated 机器都可用)
- 官方先例与**先例边界**:`pi-web-plugins/workspace-tasks` 佐证了"项目配置文件(`.pi-web/tasks.json`)"与自定义元素面板模式;但它的 `runCommand` 始终 `open: true` 且 fire-and-forget(不 await `completed`、不读输出)。本设计的 **`open: false` + `await handle.completed` + 读结果文件**是全库无先例的新用法,验证计划(§7)第一步就是最小 spike 验证这条链路。manifest 即 `package.json`,入口文件名 `pi-web-plugin.*`,无独立 manifest 文件
- **local 插件入口必须是编译后的 `.js`**:pi-web 静态服务对 `.ts` 返回 `application/octet-stream`(`src/server/piWebPluginService.ts` 的 `contentTypeFor()`,:374-382),浏览器不会当模块执行——此事实已在 pi-agent-study 库「实战 · 从零写一个 pi-web plugin」中实机验证(2026-07-15,本机 dev 实例)

## 3. 架构与数据流

```
.pi-web/status.json(探测配置,进 git)      .pi-web/status-result.json(结果,gitignore)
        │                                          ▲
        ▼                                          │
[刷新] → files.writeFile 落 runner → runCommand("node .pi-web/status-runner.mjs") ──写──┘
                                                   │
面板 ← files.readFile 读结果 ← handle.completed 落定 ─┘
```

组件三块,边界清晰:

1. **runner(`.pi-web/status-runner.mjs`,由插件在每次刷新前用 `files.writeFile` 覆写落盘,gitignore)**:command 只需 `node .pi-web/status-runner.mjs`——**不用 `node -e` 内联**,彻底绕开"runner 源码嵌进 shell 单引号"的转义地狱(§2:command 会被原样拼进 `-lc` 脚本)。runner 读 `.pi-web/status.json` → 逐项执行 probe:显式 `execSync(probe.command, { shell: "/bin/bash", timeout: 10_000 })`——**锁定 bash**(Ubuntu 24.04 的 `/bin/sh` 是 dash,变量前缀赋值/`$()` 等写法必须经 bash 解释,不锁定会造成假阴性)→ 以 `exitCode===0` 定 ✓/✗,超时/spawn 失败记 ⚠,stdout 首行(截断 ~120 字符)做 detail → 写 `.pi-web/status-result.json`。选 node 而非 jq/python:node ≥22 是 pi-web 自身的硬性运行要求,目标机必有,零新增依赖。
2. **面板(pi-web-plugin.js 的 workspacePanels 贡献)**:因为 `render`/`badge` 是同步签名(§2),面板照 workspace-tasks 的既有架构实现——**自定义元素(`customElements.define`)+ 模块级状态缓存 + `context.host.requestRender()`**:元素实例持有 `{phase: 'loading'|'fresh'|'stale'|'missing'|'refreshing'|'error', result?, error?}`;异步动作(读结果文件、刷新链路)在元素生命周期/事件回调里执行,完成后更新状态并触发重渲染;`badge()` 只读缓存的失败计数。打开时读结果文件:存在且 `collectedAt` 距今 <10 分钟 → 渲染;否则标"过期/缺失,点击刷新"。刷新按钮 → 写 runner → `runCommand`(`open: false`,`metadata: {"pi.plugin": "status-guy"}`)→ `await handle.completed` → 重读结果文件;刷新进行中按钮禁用,重复点击无效。
3. **配置(用户数据,非插件代码)**:VPS 项目 workspace 里的 `.pi-web/status.json`。

**不做后台轮询**:每次刷新都是一条真实的 terminal command run,可审计。**已知限制(接受)**:`runCommand` 每次新建一个终端记录,面板 API 没有 close/cancel 入口(`WorkspaceTerminalCommandInput` 无 terminalId 复用字段),频繁刷新会在该 workspace 的终端列表里累积已退出的隐藏终端(各带 ≤200KB replay buffer),需要时用户在 Terminals 面板手动清理——官方文档也提醒插件 "dedupe async reads/commands"(docs/plugins.md:933-937),面板的"刷新中禁用"就是对这一点的落实。

## 4. 数据契约

`.pi-web/status.json`(进 git):

```json
{
  "version": 1,
  "probes": [
    { "id": "pi-web-svc", "title": "pi-web 双服务", "group": "services",
      "command": "XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user is-active pi-web.service pi-web-sessiond.service" }
  ]
}
```

- `group` 枚举:`services` | `system` | `network` | `pi`(四组,对应面板分区)
- `command`:任意 shell 一行命令;**配置里禁止出现密钥/token**

`.pi-web/status-result.json`(gitignore,runner 每次覆写):

```json
{
  "version": 1,
  "collectedAt": "<ISO8601>",
  "probes": [
    { "id": "pi-web-svc", "title": "pi-web 双服务", "group": "services",
      "ok": true, "exitCode": 0, "detail": "active", "durationMs": 120 }
  ]
}
```

`ok`:`true`(exit 0)/ `false`(非 0)/ `null`(超时或 spawn 失败,渲染为 ⚠)。

## 5. UI 行为

- 分组卡片(四组固定顺序:核心服务/系统资源/网络面/pi 会话面),每项一行:状态符号 + title + detail
- 顶部:"采集于 X 分钟前" + 刷新按钮(刷新中禁用并显示进行态)
- 面板 `badge`:上次结果中失败项数(0 则不显示)
- 错误态要显式:配置文件缺失/JSON 非法、runCommand 抛错、结果文件缺失或 version 不认识,各给一句人话提示,不留空白面板

## 6. 初始探测清单(VPS 项目的配置内容,实施时逐条实测定稿)

- **services**:pi-web 双服务(systemd user)、x-ui(3x-ui 面板/xray)、Audiobookshelf docker 容器、rclone-podcast.service 挂载
- **system**:磁盘 `/` 用量、内存、负载、uptime
- **network**:tailscale 在线状态、443/8443 监听、`https://pod.xinsawi.com` HTTP 探活
- **pi**:sessiond 下活跃 pi 子进程数、sessiond 内存 RSS——这两条需要进程树内省,**不是一行现成命令的复杂度**,实施计划里单独列条目、允许更多试错

数据依据分两类:ABS docker 容器与 `rclone-podcast.service` 可在 `~/Developer/vps-setup/vps-info.md` 查到;**pi-web 双服务、x-ui、tailscale 的确切服务名/查询命令没有现成文档,须 SSH 实机从零确认**(vps-info.md 编写早于 pi-web/Tailscale 接入,不含这两者)。探测命令全部只读。

## 7. 工程与部署

- 目录 `packages/pi-web-status-guy/`:源码 TypeScript,`tsc` 编译出 `dist/pi-web-plugin.js`;部署单元 = `package.json`(manifest,含 name/version/pi-web 插件字段照官方样本)+ 编译产物。**注意:monorepo 既有五个包全是 pi extension,发布 `.ts` 源码、根 tsconfig `noEmit: true`、无 build 脚本——本包是仓库第一个需要编译产物的包,没有惯例可抄**,需自带 `tsconfig.json`(覆盖 `noEmit: false` + `outDir: dist`)、新增 `build` 脚本、`files` 含 `dist/`,并把新包加进根 `package.json` 的 `check` 脚本(该脚本硬编码逐包列举,不会自动覆盖新包)。
- 验证两级(完成标准):
  1. **Mac dev 实例**(照 pi-agent-study「实战 · 从零写一个 pi-web plugin」的 lab 流程:`PI_WEB_DATA_DIR` 指向实验目录,symlink 插件,浏览器/HTTP 证据):**第一步先做最小 spike**——1 个假 probe,单验 `open:false → await completed → files.readFile 拿到结果` 这条全库无先例的链路(§2 先例边界);通了再补全 配置读取→runner→结果写入→面板渲染→badge/错误态 全链路(2-3 个假探测项)
  2. **VPS 部署**:插件拷到 VPS `$PI_WEB_DATA_DIR/plugins/status-guy`(local 插件),VPS 项目 workspace 写入真实 `.pi-web/status.json`,**验收 = 手机浏览器打开面板看到真实四组状态**
- VPS 操作边界:只新增插件目录与项目配置文件,不动 pi-web 安装与既有服务;探测命令只读

## 8. 明确不做(YAGNI)

- npm 发布(形态就绪,后续想发随时能发,不在本期)
- 后台轮询 / 定时采集 / 历史曲线
- federated 多机场景的适配测试(API 标注兼容,但本期只验 local)
- 修改 critic-guy 或任何现有项目
