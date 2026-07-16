# pi-web-status-guy

配置驱动的 pi-web workspace 状态面板插件:监控项定义在 `.pi-web/status.json`,面板一键刷新后按四组(核心服务/系统资源/网络面/pi 会话面)展示 ✓/✗/⚠ + 一行详情。改监控项 = 改配置文件,零代码。

## 安装(local 插件)

pi-web 支持从 `$PI_WEB_DATA_DIR/plugins/<id>/`(默认 `~/.pi-web/plugins/<id>/`)加载 **local** 插件,发现带 mtime cache-buster,无需重启服务,浏览器刷新即可生效。

```bash
cd packages/pi-web-status-guy && npm run build   # tsc 编译出 dist/pi-web-plugin.js
tar czf /tmp/status-guy.tgz package.json dist README.md
mkdir -p ~/.pi-web/plugins/status-guy            # 在目标机(可经 SSH)
cat /tmp/status-guy.tgz | ssh <host> 'tar xzf - -C ~/.pi-web/plugins/status-guy'
```

`package.json` 的 `piWeb.plugins` 字段声明入口:

```json
{ "piWeb": { "plugins": [{ "id": "status-guy", "module": "dist/pi-web-plugin.js" }] } }
```

**注意**:入口必须是编译后的 `.js`——pi-web 静态服务对 `.ts` 返回 `application/octet-stream`,浏览器不会当模块执行。

## 配置契约(§4)

`.pi-web/status.json`(探测配置,**进 git**,由用户维护,插件本身不写):

```json
{
  "version": 1,
  "probes": [
    {
      "id": "pi-web-svc",
      "title": "pi-web 双服务",
      "group": "services",
      "command": "XDG_RUNTIME_DIR=/run/user/$(id -u) systemctl --user is-active pi-web.service pi-web-sessiond.service",
      "timeoutMs": 10000
    }
  ]
}
```

字段表:

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `version` | `1` | 是 | 固定值,其他值视为不认识的格式 |
| `probes[].id` | string | 是 | 探测项唯一标识 |
| `probes[].title` | string | 是 | 面板展示的标题 |
| `probes[].group` | 枚举 | 是 | `services` \| `system` \| `network` \| `pi` 四选一,对应面板四个固定分区(核心服务/系统资源/网络面/pi 会话面) |
| `probes[].command` | string | 是 | 任意一行 shell 命令,以 `bash -c` 语义执行,不做二次转义;**配置里禁止出现密钥/token** |
| `probes[].timeoutMs` | number | 否 | 默认 10000ms,超时判定为 ⚠(不是 ✗) |

`.pi-web/status-result.json`(runner 每次覆写;`.pi-web/status-result.json` 与 `.pi-web/status-runner.mjs` 均由 runner/面板运行时覆写,若目标 workspace 是 git 仓库,建议部署时**手动**把这两个路径加进它的 `.gitignore`——插件不会自动改 `.gitignore`;本次 VPS 部署的 `/root/vps-status` 非 git 仓库,无需此步):

```json
{
  "version": 1,
  "collectedAt": "2026-07-15T14:05:44.458Z",
  "probes": [
    { "id": "pi-web-svc", "title": "pi-web 双服务", "group": "services", "ok": true, "exitCode": 0, "detail": "active", "durationMs": 120 }
  ]
}
```

`ok`:`true`(exit 0)/ `false`(非 0,`exitCode` 为进程退出码)/ `null`(超时或 spawn 失败,`exitCode` 为 `null`,渲染为 ⚠)。`detail` 取 stdout 首行(截断 ~120 字符);失败时取 stderr 首行、再退回 stdout 首行、再退回错误消息。

## 刷新语义

- **纯手动**:不做后台轮询/定时采集。每次点"刷新"都是一条真实的 `runCommand`(`open:false`,`metadata: {"pi.plugin":"status-guy"}`),写 runner → 等待完成 → 重读结果文件,可审计。
- 打开面板时读 `.pi-web/status-result.json`;若 `collectedAt` 距今 **< 10 分钟**(`FRESH_MS = 600_000`)视为新鲜直接渲染,否则标"(已过期)"但仍展示,并非清空。
- 配置缺失/结果缺失 → "还没有采集结果,确认 workspace 里有 `.pi-web/status.json`,然后点击刷新"。
- runner 自身抛错(如 `status.json` 不存在/JSON 非法)→ 仍会落盘一份 `{version:1, probes:[], error:"..."}`,面板渲染出 `runner 报错:<message>` 的错误横幅,不留空白。
- 刷新进行中按钮禁用并显示"采集中……",重复点击无效(模块级状态缓存,按 `machine:project:workspace` 区分)。
- 面板 `badge`:上次结果里 `ok !== true` 的探测项数(0 则不显示 badge)。

## 已知限制

- `runCommand` 每次新建一条终端记录,面板 API 没有 close/cancel 或 terminalId 复用入口,**频繁刷新会在该 workspace 的 Terminals 面板里累积已退出的隐藏终端**(各带 ≤200KB replay buffer)。需要时在 Terminals 面板手动清理;这是官方 API 现状,插件侧已通过"刷新中禁用按钮"避免同一操作重复触发。
- 不做历史曲线/多机 federated 场景验证(当前只验证 local 插件 + 单机 workspace)。

## 验证记录

### Task 4:Mac dev 实例(2026-07-15,pi-web 源码钉 commit `a857fe4e`,对应发布版 `1.202607.0`)

- `PI_WEB_DATA_DIR` 指向实验目录,插件以 symlink 形式挂载为 local 插件;`manifest.json` 正确列出 `status-guy`,`module` 内容与本地 `dist/pi-web-plugin.js` 字节级一致。
- **全库无先例链路**验证通过:`runCommand({open:false}) → await handle.completed → files.readFile 读结果文件` 四环节(发出/完成/落盘/可读)均有 HTTP 证据。
- 全链路四组假探测(ok/fail/超时/pi 版本)验证:`succeeded` 状态、`status-result.json` 三态(✓/✗/⚠)与 runner 源码逻辑吻合;`failCount` badge 计算、"刚刚"新鲜度文案、刷新按钮禁用态经源码 + 实测数据交叉确认(浏览器扩展未连接,像素级视觉确认顺延)。
- 删除 `status.json` 后刷新:`runCommand` 本身 `failed`,但 `handle.completed` 仍会 resolve,结果文件仍落盘 `{version:1, probes:[], error:"ENOENT..."}`,面板按预期渲染错误横幅而非空白。
- 单测 `node --test packages/pi-web-status-guy/test/*.test.ts`:15/15 通过。
- 环境级坑(非本包代码缺陷):macOS 上 `node-pty` 的 `spawn-helper` 预编译二进制经 `npm install` 解包后丢失可执行位,导致 `posix_spawn` 失败;`chmod +x` 修复,不影响 `pi-web` 或本包源码。

### Task 5:VPS 部署(2026-07-16,VPS 实际运行 `@jmfederico/pi-web@1.202607.0`,2026-07-15 刚升级验证过)

- SSH 只读发现(`~/Developer/vps-setup/vps-ssh.sh`):确认服务名 `pi-web.service`/`pi-web-sessiond.service`(user 级 systemd,需 `XDG_RUNTIME_DIR=/run/user/$(id -u)` 前缀)、`x-ui.service`、docker 容器 `audiobookshelf`、`rclone-podcast.service`;`tailscale status --peers=false` 单行自身状态即够,无需再 `head -1`;`443/8443` 监听需 `ss -tuln`(不是 `-ltn`——Hysteria2 走 UDP,`-t` only 会漏掉,已实测验证 `ss -tuln` 输出 tcp:443 + udp:8443 共 2 条);十二条探测命令逐条 SSH 实测取得真实输出后定稿(见 `.superpowers/sdd/task-5-report.md` 完整记录)。
- 插件部署:`~/.pi-web/plugins/status-guy/dist/pi-web-plugin.js` 已拷贝上线;经 Tailscale(`http://100.72.216.2:8504/pi-web-plugins/manifest.json`)确认 `status-guy` 出现,`module` 内容与本地 `dist/pi-web-plugin.js` 一致。
- 目标 workspace:VPS 原本零已注册 pi-web 项目,经确认走"专用目录"方案——注册 project **"VPS Status"**(`/root/vps-status`,非 git 仓库故无 .gitignore 步骤),12 条定稿探测写入其 `.pi-web/status.json`。
- 服务器侧刷新链路终验(与插件刷新按钮同一条链路,经 HTTP API 模拟):`files` 写 runner → `POST terminal-command-runs`(`node .pi-web/status-runner.mjs`)→ run `succeeded` `exitCode:0`(~253ms)→ 读 `.pi-web/status-result.json`:**12/12 全 ✓**(0 ✗ 0 ⚠),detail 与 SSH 单条实测一致。
- 行为注记:`pi-sessions` 探测(sessiond 直接子进程数)在刷新时至少为 1——刷新这条 run 自己的 pty 就是 sessiond 的子进程,属自我观测效应,数值真实。
- **手机可视验收:待用户确认**(手机 Tailscale 打开 `http://100.72.216.2:8504` → VPS Status 项目 → Status 面板,回复"看到了"才算过)。
