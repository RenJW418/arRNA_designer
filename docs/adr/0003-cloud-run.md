# ADR-0003：Cloudflare Pages + Cloud Run

- 状态：Accepted
- 日期：2026-07-28

## Context

要求无自购服务器、尽量使用免费额度，同时 Python 分析可能从秒级增长到分钟或更长。

## Decision

Cloudflare Pages 托管静态 React；Cloud Run Service 托管 FastAPI；中长任务升级为
Cloud Run Jobs。Supabase Postgres 保存元数据。

## Consequences

支持 scale-to-zero、容器可移植和长任务演进。Cloud Run 需要结算账号且免费额度并非
费用保证，必须限制实例并配置预算。境外平台不保证中国大陆稳定访问。

## Alternatives

Render Free 可作为演示备选，但休眠、易失文件和任意重启不利于任务可靠性。2026 年
Hugging Face、Fly.io 和 Railway 的免费政策不再适合作为长期生产基线。
