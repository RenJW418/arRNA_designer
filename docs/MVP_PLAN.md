# 7 天 MVP 与商业化路线

## 7 天最小可上线版本

| 天 | 交付物 | 验收 |
|---|---|---|
| Day 1 | 设计系统、页面壳、API/数据契约 | 两种输入模式与结果页可导航 |
| Day 2 | Sequence Mode 校验、位点选择、FASTA 上传 | DNA/RNA/IUPAC、大小和位置边界测试通过 |
| Day 3 | NCBI gene/species 搜索与 transcript 获取 | DMD/human 示例可稳定返回带版本 transcript |
| Day 4 | exon/transcript 结构图与局部 sequence viewer | 可点击 exon 并选择碱基位置 |
| Day 5 | Task API、算法空适配器、模拟结果与下载 | task_id、轮询、失败与过期状态完整 |
| Day 6 | Cloudflare Pages + Cloud Run + Supabase 部署 | Preview/production 可访问，预算告警已设 |
| Day 7 | 域名、HTTPS、隐私清理、端到端测试和文档 | 自定义域名可用，24h 清理演练通过 |

MVP 明确不做：登录、支付、Celery、Redis、协作项目、临床解释和真正的 arRNA
评分算法。算法加入时实现 `AnalysisEngine` 接口即可。

## 发布指标

- 新用户完成首个任务的中位时间 < 5 分钟；
- 表单校验错误能在字段旁解决，不依赖阅读文档；
- NCBI 成功请求的缓存命中后 P95 < 1 秒；
- 短任务 P95 < 10 秒；
- 任务成功率 > 95%（排除明确输入错误）；
- 过期数据清理成功率 100%。

## 阶段 2：可复现科研产品

- 实现与验证 arRNA pipeline；
- Cloud Run Jobs 承担中长任务；
- 公共参考数据缓存与版本快照；
- 结果永久链接只保存参数和版本，不保存私人原始序列；
- 可引用的 method/version、批量任务和标准导出；
- 数据库迁移、备份和 Sentry/OpenTelemetry。

## 阶段 3：商业化

```text
Anonymous MVP
→ 登录（ORCID + email）
→ 项目/任务历史
→ 配额与用量计量
→ Stripe/国内支付渠道
→ API keys 与按量计费
→ 团队空间/审计
→ 私有部署与机构合同
```

- 用户系统：Supabase Auth 或独立 OIDC；科研用户优先 ORCID。
- 会员：按月任务数、并发、保存期和批量能力分层，不按“结果质量”分层。
- API 收费：API key、幂等、速率限制、用量账本和 webhook。
- 私有部署：同一 Docker 镜像，支持客户 Postgres/S3/对象存储。
- 合规：若处理患者来源数据，需重新做数据分类、同意、区域驻留、DPA 和安全评估；
  当前公共工具不得宣称符合临床或医疗法规。

## 何时引入 Redis/Celery

只有同时满足以下任一条件才引入：

- 任务需复杂优先级、撤销、链式编排；
- 单任务需要多个常驻 worker；
- Cloud Run Jobs 调度开销或限制已成为瓶颈；
- 已有付费、常驻 Redis 与 worker 预算。

此前继续使用 Postgres 状态机 + Cloud Run Jobs，降低运维面。
