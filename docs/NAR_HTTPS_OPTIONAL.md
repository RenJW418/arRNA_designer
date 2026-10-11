# 可选 HTTPS/443 边缘配置（未部署）

日期：2026-10-06。最终域名未提供；本文件不代表已签发证书、启用 HTTPS 或更新公网服务。当前 HTTP/8008 旧服务、本地开发服务、默认 `docker-compose.prod.yml` 和 Nginx 配置均不修改。

方案是一个独立 Caddy 2 TLS 入口：80 自动跳转到 443，443 将同一站点的页面、`/api/`、`/docs`、`/health` 和下载请求转发给运营方显式指定的现有 HTTP upstream。此方案不重新构建或重启既有前后端，亦不等于旧服务已经包含最新本地网站内容；内容发布是另一项需运营方确认的工作。

官方依据（2026-10-06 查阅）：[Automatic HTTPS](https://caddyserver.com/docs/automatic-https)、[Caddyfile 环境变量](https://caddyserver.com/docs/caddyfile/concepts#environment-variables)、[reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)、[Docker Compose 运行说明](https://caddyserver.com/docs/running#docker-compose)。Caddy 会根据实际域名、DNS 与端口可达性申请并续期公开证书，不能在缺少域名时声称 TLS 已完成。

## 文件与参数

- `docker-compose.https.optional.yml`：单独运行的 edge 项目，绑定 TCP 80/443；不应与旧 production Compose 合并。
- `deploy/https/Caddyfile`：用环境变量指定站点和 upstream；不开启 Caddy access-log 指令。
- `deploy/https/https.env.example`：无凭据模板，域名与 upstream 默认留空，避免误启动。
- `LEAPER_DOMAIN`：运营方确认的公开 DNS hostname，不含协议、端口、路径，不能用占位域名申请证书。
- `LEAPER_HTTPS_UPSTREAM`：从 edge 容器可访问的 HTTP upstream。例如 Linux 宿主机的已有 8008 端口可使用 `http://host.docker.internal:8008`；必须由运营方确认该 upstream 所在机器、网络可达性与其应发布的内容。不要填写本项目旧公网 IP 作为未经审查的默认值。
- `LEAPER_CADDY_IMAGE`：默认公开 `caddy:2-alpine` 标签。上线前核对实际镜像并固定 digest；此处未虚构镜像 digest 或拉取/运行镜像。

## 运营方实际启用时

先确认域名 A/AAAA 指向正确主机，80/443 无端口冲突且防火墙/安全组可达，ACME 服务可以从主机访问，Caddy 的 `/data` 持久化卷可写。DNS 若有 AAAA，应确保 IPv6 可达。先核对 HTTP upstream 的首页、API 与下载资源版本；TLS 入口不会把旧内容自动换成新版本。

从 `website/` 目录，将 env 模板复制为独立运营配置并填入真实值；需要 Docker Compose v2 插件。若主机仅提供独立 `docker-compose` 命令，可将下方每个 `docker compose` 替换为 `docker-compose`（本机静态验证使用了后者）。以下命令仅是待执行说明，本任务不运行启动/停止命令：

```sh
cp deploy/https/https.env.example deploy/https/https.env
# 编辑 deploy/https/https.env，填入运营方确认的参数。
docker compose --env-file deploy/https/https.env -p leaper-https-edge -f docker-compose.https.optional.yml config --quiet
# 容器内验证配置，不映射监听端口；需要先准备已审核镜像。
docker compose --env-file deploy/https/https.env -p leaper-https-edge -f docker-compose.https.optional.yml run --rm --no-deps https-edge caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# 仅在域名、端口、镜像、隐私配置与部署授权确认后：
docker compose --env-file deploy/https/https.env -p leaper-https-edge -f docker-compose.https.optional.yml up -d
```

启用后，以真实域名访问 `https://域名/` 与 `/health`，确认浏览器证书受信任、HTTP/80 跳转正确；运行下载的 Python 模板并复测常规、exon 与 refinement 的真实浏览器流程、JSON/FASTA/CSV、下载文件与共享输入。检查 `/docs` 的 OpenAPI URL 没有混合内容。默认 Nginx 向后端设置 HTTP scheme；目前页面/API使用同源相对 URL，仍须上线验证 Swagger 与任何新增绝对 URL/重定向。不要把部署步骤当作已完成验证。

回退仅停止此独立 edge 项目，不操作旧 production 项目：

```sh
docker compose --env-file deploy/https/https.env -p leaper-https-edge -f docker-compose.https.optional.yml down
```

不加 `--volumes`，保留证书持久化数据；若需删除证书/配置卷，须由运营方单独决定。停用 edge 后 HTTPS/443 不再提供服务，但旧 HTTP upstream 不由该项目停止。

## 隐私与未验证事项

没有启用 Caddy access-log 指令不等于零日志或零保留。旧 Nginx、Uvicorn、Docker 日志驱动、云平台和防火墙日志仍需运营方审核；制定真实的数据保留/删除政策后，再更新公开隐私声明。不得记录设计 request/response body，不要把序列放入查询字符串。TLS 加密传输也不证明服务端不保留数据。

截至本任务：仅准备文件和检查 Compose 展开；未运行 Caddy、未申请证书、未绑定 DNS、未占用 80/443、未触碰 HTTP/8008。缺少最终域名、DNS/端口可达性、证书签发结果、镜像固定与实际日志保留审核；Caddyfile 的运行验证与公网端到端验证尚未进行。

## 部署后的同源公网验收（尚未执行）

两个浏览器 smoke 的 `SMOKE_MODE` 明确区分：`local-forward`（默认，仅 loopback；转发 API 到独立本地后端）、`same-origin`（仅 loopback；不拦截 API，供本地完整代理测试）、`public`（运营方提供真实 HTTPS hostname，443；绝不拦截 API）。公网模式拒绝缺失域名、HTTP、其他端口、IP/localhost 和 example/invalid 等占位域名，所有模式都不忽略 TLS 证书错误。公网模式不执行本地 NCBI mock 用例，也不会在失败日志打印序列正文。

在运营方确认上线后，从 `website/` 执行；`FRONTEND_URL` 必须填运营方实际提供的根 URL，不能填此文档示例或猜测域名。`MODULE_ROOT` 是包含 Playwright 的 node_modules 目录；Chrome 和匹配的 WebKit 须已安装。

```sh
# 由运营方填写真实域名；为空时脚本必须失败。
export FRONTEND_URL=''
export SMOKE_MODE=public
# 可选：export MODULE_ROOT='/实际安装路径/node_modules'
# 可选：export CHROME_EXECUTABLE='/实际安装路径/Chrome'
node docs/NAR_BROWSER_SMOKE.mjs
node scripts/verify_protocol_smoke.mjs
python3 frontend/public/downloads/leaper_api_example.py --base-url "$FRONTEND_URL"
```

`BACKEND_URL` 在公网模式不起作用。验收直接检查同一 origin 的 HTTP/80→HTTPS/443 跳转、可信 TLS、首页、health、`/api/v1/openapi`、Swagger、Python/JSON 教学下载及真实设计 POST，然后执行原有交互检查。保存命令、UTC 时间、脚本模式、浏览器版本和退出码；仅 `public` 模式在真实部署域名通过后，才能称公网端到端通过。本地透明代理集成以及自签名 TLS 拒绝测试都不能替代这一步。

构建上下文新增 `frontend/.dockerignore` 与 `backend/.dockerignore`，排除私有 env、依赖、构建产物、Git/cache 和临时结果，保留源码、lock、pyproject 及 production Nginx 配置。这不等于 Docker 镜像已构建；本轮没有启动 Docker daemon。
