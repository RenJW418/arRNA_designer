# 部署、域名与运行手册

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
