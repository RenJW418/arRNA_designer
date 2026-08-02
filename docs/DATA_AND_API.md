# 数据、坐标与 API 契约

## 1. 坐标原则

不要使用只有 `"position": 100` 的对象。位置必须同时声明参考对象、坐标体系、
索引基准和方向。

对外 UI 统一显示 1-based closed coordinates；后端计算可以转换为 0-based
half-open，但不得在未标记情况下混用。

```json
{
  "species_taxon_id": 9606,
  "gene_id": "1756",
  "gene_symbol": "DMD",
  "assembly_accession": "GCF_000001405.40",
  "transcript_accession": "NM_004006.3",
  "chromosome_accession": "NC_000023.11",
  "coordinate_system": "transcript",
  "position": 1234,
  "indexing": "one_based",
  "strand": "-"
}
```

允许的 `coordinate_system`：

- `sequence`：用户提交序列内坐标；
- `genomic`：参考 assembly/chromosome 坐标；
- `transcript`：accession.version 上的 cDNA 坐标；
- `cds`：以 CDS 起点为基准；MVP 只显示转换，不允许单独提交 HGVS。

## 2. 核心实体

```text
Task
├── id (UUID)
├── status
├── mode
├── application_type
├── input_summary (no raw sequence)
├── reference_snapshot_id
├── pipeline_version
├── created_at / started_at / completed_at / expires_at
└── error_code / error_summary

ReferenceSnapshot
├── source = NCBI
├── taxon_id
├── gene_id
├── assembly_accession
├── transcript_accession
├── fetched_at
└── source_release

Result
├── task_id
├── summary
├── candidates
├── warnings
└── temporary_artifact_locator
```

生产数据库不含原始序列。`sequence_sha256` 可用于一次任务内幂等和排错，但需评估
短序列可枚举风险；默认加服务端 pepper 或只保留到过期时间。

## 3. REST API v1

### Reference endpoints

```text
GET /api/v1/references/species?q=human
GET /api/v1/references/genes?taxon_id=9606&q=DMD
GET /api/v1/references/genes/{gene_id}
GET /api/v1/references/genes/{gene_id}/transcripts
GET /api/v1/references/transcripts/{accession}/structure
GET /api/v1/references/transcripts/{accession}/sequence?start=1&end=500
```

结构接口返回 assembly、strand、exons、CDS、UTR 和 source_version。序列接口必须
分页/按窗口读取，不能默认返回超长整基因序列。

### Validation and coordinate endpoints

```text
POST /api/v1/inputs/validate
POST /api/v1/coordinates/convert
```

### Task endpoints

```text
POST   /api/v1/tasks
GET    /api/v1/tasks/{task_id}
GET    /api/v1/tasks/{task_id}/result
GET    /api/v1/tasks/{task_id}/artifacts/{format}
DELETE /api/v1/tasks/{task_id}
```

创建任务：

```json
{
  "mode": "gene",
  "application_type": "exon_skipping",
  "reference": {
    "species_taxon_id": 9606,
    "gene_id": "1756",
    "assembly_accession": "GCF_000001405.40",
    "transcript_accession": "NM_004006.3"
  },
  "target": {
    "coordinate_system": "transcript",
    "position": 1234,
    "indexing": "one_based",
    "strand": "-",
    "exon_id": "exon-51"
  },
  "parameters": {}
}
```

返回异步任务：

```json
{
  "task_id": "55d9f413-344f-498a-a542-653654f9f5a4",
  "status": "queued",
  "status_url": "/api/v1/tasks/55d9f413-344f-498a-a542-653654f9f5a4",
  "expires_at": "2026-07-29T10:00:00Z"
}
```

### 错误格式

```json
{
  "error": {
    "code": "TRANSCRIPT_VERSION_REQUIRED",
    "message": "请选择包含版本号的 transcript accession。",
    "request_id": "req_...",
    "retryable": false,
    "details": {}
  }
}
```

错误码至少包括：`INVALID_SEQUENCE`、`AMBIGUOUS_GENE`、`NCBI_UNAVAILABLE`、
`REFERENCE_VERSION_MISMATCH`、`INVALID_COORDINATE`、`TASK_EXPIRED`、
`ANALYSIS_NOT_IMPLEMENTED`。

## 4. 幂等与轮询

- `POST /tasks` 支持 `Idempotency-Key`，相同 key 与请求摘要返回同一任务。
- 轮询初始 1 秒，随后 2、4、8 秒，最大 10 秒并加入 jitter。
- `Retry-After` 由 API 返回；页面隐藏后停止轮询。
- 第二阶段可升级为 Server-Sent Events，但轮询更适合 MVP 和无状态部署。
