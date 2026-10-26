# 部署、域名与运行手册

> 下文的 Cloudflare/Cloud Run、任务队列和临时数据生命周期是早期规划，不能视为当前部署或已实现的保留政策。当前生产 Compose 使用 HTTP/8008；可选、未部署的 HTTPS/443 方案与明确的待确认项见 [NAR_HTTPS_OPTIONAL.md](NAR_HTTPS_OPTIONAL.md)。默认生产文件未因此更改。

## 当前实现：序列分析 API 与运行依赖

以下内容描述已实现的同步 API；后续编号章节保留早期部署规划。
后端要求 Python 3.12 或更高版本，`backend/Dockerfile` 使用
`python:3.12-slim`。`backend/pyproject.toml` 已声明
`ViennaRNA>=2.7.2,<3` 和 `defusedxml>=0.7.1,<1`。
在 `backend/` 中执行以下命令安装或更新现有环境：

```bash
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python -c 'import RNA; print(RNA.__version__)'
.venv/bin/python -m pytest
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

首次建立环境及前端启动步骤见 [README](../README.md)。依赖更新后需重建
后端容器；生产 Compose 的 `up --build -d` 命令会从项目声明安装依赖。
ViennaRNA 2.7.2 已在本地 Python 3.14 环境实际运行，并已验证 Python 3.12
Linux x86_64 wheel 可获取；这不代表已完成生产容器构建或部署。
折叠使用 Python 原生绑定，无需另装 `RNAfold` 命令，也不调用外部折叠服务。

| 路由 | 请求与限制 | 返回与错误处理 |
| --- | --- | --- |
| `POST /api/v1/analysis/annotations` | `sequence` 为 1–20,000 nt；可选 `transcript_accession`；`regions` 最多 200 项，采用 1-based inclusive 的 `start/end`，并包含 `kind`、可选 `label` | 归一化序列、带来源的 `user/predicted/reference` 特征、`warnings`、`prediction_method`、成功解析的 accession.version；输入无效返回 422 |
| `POST /api/v1/analysis/rnafold` | `sequence` 为 5–1001 nt；`topology` 为 `linear`（默认）或 `circular`；`temperature` 为 0–100 °C，默认 37 | 真实 MFE 结构与能量、配分函数统计、逐碱基未配对概率及均值、MFE 未配对比例、MFE 配对及对应 ensemble probability、坐标和引擎版本；输入或计算无效返回 422，引擎缺失或容量占满返回 503 |

两个接口均接受普通序列或单条 FASTA，去除空白，并拒绝多条 FASTA、模糊碱基和
非 A/C/G/T/U 字符。注释输出采用 T，折叠输出采用 U；坐标按归一化后的序列计算。
RNAfold 的 `pairs` 仅列出 MFE 结构中的配对，`unpaired_probabilities` 使用完整
配对概率矩阵计算，未施加展示阈值。输入序列之外不会附加 linker 或构建体序列。
每个 API 进程最多同时容纳两项折叠；没有后台任务队列、跨进程配额或折叠硬超时。
前端取消等待不会保证已经启动的原生计算被中止。

注释在本地扫描原有五个 ESEfinder 矩阵，包含不含 A 的基序，并标为预测证据。
指定 NCBI accession 时，仅向固定 EFetch 地址发送 accession，不发送用户序列；
只接受单条返回记录，核对 accession 与所请求的版本后，在本地查找正向精确匹配。
唯一匹配成功才返回参考特征；重复匹配、未匹配、访问失败或无效 XML 会转为明确
警告，本地预测及用户区域仍可返回。反向、模糊或不支持的位置不作为精确参考坐标；
多段位置分别返回，片段边界处的特征会裁切并说明。

新参考查询的资源边界为：原始响应最多 5,000,000 字节，参考序列最多
1,000,000 nt，参考记录的 feature 条目最多 10,000 项，单项超过 1000 段的位置会略过。
网络连接超时为 4 秒，读取超时为 8 秒，并在每个收到的数据块检查 12 秒总时限；
这是数据块检查时限，正在进行的网络读取仍受读取超时约束。重定向、压缩响应、
XML 自定义实体及外部实体均不接受。当前新查询不使用 NCBI API key、自动重试、缓存或
服务级请求限流；网络不通或服务限流时通过返回的警告呈现。

序列长度和原始序列文本长度在模型字段中校验，这不等同于整个 HTTP 请求体的
传输大小限制。公网入口的请求体上限、速率限制与日志保留仍由实际部署配置负责。
新分析模块不记录用户序列；如启用代理或平台日志，勿采集请求/响应正文。
完整字段定义以服务的 `/api/v1/openapi` 与 `/docs` 为准。

## 1. 环境

```text
local      docker compose
preview    每个前端 PR 的 Cloudflare Pages Preview + 独立测试 API
production app.example.bio + api.example.bio
```

## 2. 前端：Cloudflare Pages

1. 将 `frontend` 连接到 Git 仓库。
2. 构建命令：`npm ci && npm run build`；输出目录：`dist`。
3. 配置 `VITE_API_BASE_URL=https://api.example.bio/api/v1`。
4. 添加 `app.example.bio` 或根域。
5. 启用 SPA fallback、安全响应头和生产分支保护。

### 生产镜像必须传入版本与 commit 构建参数

生产构建必须显式传入 `VITE_APP_VERSION` 和 `VITE_APP_COMMIT` 两个构建参数，
页脚的版本标注和 commit 链接都来自它们。可照抄的命令：

```bash
docker build \
  --build-arg VITE_APP_VERSION="$(git describe --tags --always)" \
  --build-arg VITE_APP_COMMIT="$(git rev-parse HEAD)" \
  -f frontend/Dockerfile.production frontend
```

**不传这两个参数时页脚会显示 `dev`，线上不可接受。**

## 3. 后端：Cloud Run

1. 构建 `backend/Dockerfile` 并推送到 Artifact Registry。
2. 部署 Cloud Run Service，region 优先 `asia-east1`（台湾）并实测延迟。
3. 设置 `min-instances=0`、`concurrency=1`（CPU 密集型起点）和较小
   `max-instances` 防止费用失控。
4. 注入 NCBI key、数据库 URL 等 Secret；不要写入镜像。
5. 将 `api.example.bio` 映射到服务，CORS 仅允许生产和 Preview 域。
6. 设置预算告警。注意：Cloud Run 免费额度仍要求结算账号，超额可能收费。

分钟级任务启用 Cloud Run Job：

- API 持久化 `queued` 状态；
- 触发 Job，并通过 task_id 获取临时输入；
- Job 写回状态和结果位置；
- 失败按错误类型决定是否重试；
- 定时清理 `expires_at < now()` 的记录和文件。

## 4. 域名

建议优先选择短、易读、无连字符且不暗示临床认证的 `.bio`、`.org` 或 `.app`。
购买前检查商标、社交账号和同名学术项目。不要把具体实验方法锁死在主域名中；可采用：

```text
example.bio              品牌首页
app.example.bio          LEAPER 设计工具
api.example.bio          FastAPI
docs.example.bio         方法与 API 文档（后续）
```

绑定流程：

```text
域名注册商购买
→ 将 nameserver 指向 Cloudflare
→ Cloudflare Pages 添加 apex/app 子域
→ api 子域指向 Cloud Run 映射目标
→ DNS 验证
→ 平台自动签发 TLS
→ 强制 HTTPS 与 www/apex 单向重定向
```

根域和子域都支持。DNS 记录值必须以平台控制台当时给出的值为准，不要从旧教程复制。

## 5. 临时数据生命周期

```text
upload → validation → /tmp/{task_id} → analysis → download
                                      ↘ delete on success/error
fallback cleanup: expires_at + scheduled sweeper (≤24h)
```

- 容器 `/tmp` 不是持久化存储，不能作为任务队列或数据库。
- 若使用对象存储，bucket 必须私有，生命周期规则 1 天，下载使用短时签名 URL。
- `DELETE /tasks/{id}` 立即删除临时对象并把元数据标记为 deleted。
- 日志采集器配置字段过滤，禁止 request/response body。

## 6. 上线检查

- 自定义域名和 HTTPS 验证；
- CORS、CSP、HSTS、X-Content-Type-Options；
- 上传大小、扩展名和实际内容校验；
- NCBI key、超时、重试和限流；
- Cloud Run 预算告警与实例上限；
- 24 小时自动清理演练；
- 隐私声明、Research Use Only 和版本信息；
- 使用大陆、欧美网络分别做可达性与延迟测试。
