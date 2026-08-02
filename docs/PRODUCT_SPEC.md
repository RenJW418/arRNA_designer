# 产品规格与交互设计

## 1. 产品定位

服务对象是需要设计 LEAPER arRNA 的分子生物学、医学遗传学和 RNA 编辑研究者。
首要价值不是“参数越多越专业”，而是把参考序列、transcript、exon、坐标与结果版本
明确关联，让一次设计可检查、可复现、可引用。

MVP 不提供临床诊断结论。所有页面应明确标注“Research use only”。

## 2. 信息架构

```text
Home
├── New design
│   ├── Sequence mode
│   └── Gene / Species mode
├── Results/:task_id
├── Method & References
├── Example datasets
└── Privacy / Data retention
```

## 3. 新建任务：四步向导

### Step 1 — Input source

用两个清晰卡片选择模式，不把两个表单同时展开。

**Sequence Mode**

- 粘贴 DNA/RNA 或上传 FASTA（MVP 最大 10MB，最多一条主序列）。
- 自动去除空白并大写；允许 IUPAC 模糊碱基，但提示其影响。
- 自动判断 DNA/RNA；若同时含 T 和 U 则阻止提交。
- 用户必须声明方向：`5'→3' target sequence`，并可选择 `+/-` strand。
- 编辑位点使用序列内位置，界面为 1-based；实时显示上下游上下文。

**Gene / Species Mode**

- Species 使用受控搜索，不接受任意文本；首版支持 human/mouse。
- Gene 支持 symbol、Gene ID、RefSeq accession。
- 300–500ms debounce 后查询，显示唯一 NCBI Gene ID 避免同名误选。
- 选择 gene 后加载 transcript 列表；优先标记 MANE Select/RefSeq Select。
- 每项显示 accession.version、长度、CDS 区间和参考组装。

### Step 2 — Transcript and target

Gene Mode 展示 transcript 结构轨道：

- intron 为细线，exon 为按长度缩放的块；
- UTR、CDS、目标 exon 使用不同纹理/颜色；
- hover 显示 exon 序号、长度、genomic span、transcript span；
- click exon 后打开 sequence viewer，并将目标限制到该 exon；
- 缩放时显示碱基，默认只显示局部窗口，避免渲染整条长基因。

位点选择支持：

1. 在 sequence viewer 点击碱基；
2. 输入 transcript 位置；
3. 高级模式输入 genomic coordinate。

三者实时互相转换，并始终显示坐标类型、版本和 strand。

### Step 3 — Application

单选：

- Normal editing
- Exon skipping

Normal editing 需要目标碱基和设计参数。Exon skipping 必须选择目标 exon，并展示：

- exon length；
- splice acceptor/donor 上下文；
- CDS phase/frame；
- 跳跃后是否预测保持 reading frame；
- 警告：预测不等于实验验证。

### Step 4 — Review & submit

提交前用“可复现摘要”展示所有输入、assembly、transcript version、坐标和参数。
用户确认后创建任务。可复制参数 JSON，但原始序列不写入长期数据库。

## 4. 任务与结果页面

状态机：

```text
draft → validating → queued → running → succeeded
                                  └──→ failed
                     └───────────────→ expired
```

结果页由以下部分组成：

1. Summary：gene、species、transcript、assembly、编辑位点、应用类型。
2. Sequence context：上游、目标、下游；标记 exon 和 splice boundary。
3. Transcript diagram：保持与输入页相同视觉编码。
4. Candidate table：排名、arRNA sequence、长度、目标窗口、评分和警告。
5. Method provenance：pipeline version、reference version、运行时间。
6. Export：CSV、JSON、FASTA 和可打印报告（后续 PDF）。

失败页面必须给出可行动的错误：修改输入、重试 NCBI、改用 Sequence Mode；
不向用户暴露堆栈。

## 5. NCBI 数据链路

1. Gene 搜索：symbol + taxonomy 精确匹配，保存 NCBI Gene ID。
2. Gene 数据包：获取 gene、transcript、protein 和注释报告。
3. Sequence：按 accession.version 获取 RNA/genomic FASTA。
4. Annotation：解析 exon/CDS/strand/assembly，转换到统一模型。
5. Cache：以 `gene_id + assembly_accession + dataset_release` 为键。

缓存建议：

- gene 搜索结果：6 小时；
- transcript/exon 元数据：7 天；
- 参考序列：30 天，但只缓存公共参考数据；
- 404：5 分钟；5xx 不做长期负缓存。

失败处理：连接和读取超时、最多 3 次指数退避、遵守 NCBI 请求频率；配置
`NCBI_API_KEY`、tool 和 email。缓存条目必须携带 fetched_at、source URL、
accession.version 和 assembly，结果中显示这些版本。

## 6. 隐私与清理

- 浏览器提交前提示原始序列将在任务完成或最多 24 小时后删除。
- 日志、错误追踪和分析埋点不包含序列、FASTA 内容或结果文件。
- 下载链接短时有效且不可猜测。
- 数据库只保留输入模式、序列长度/哈希、非敏感参数、状态、版本和时间戳。
- 用户可在结果过期前主动点击“Delete now”。
