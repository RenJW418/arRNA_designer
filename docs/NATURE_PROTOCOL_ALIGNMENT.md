# Nature Protocols final 与网站设计规则

更新日期：2026-10-06。依据用户指示，设计原则以固定稿件 `../NatureProtocol/final/20180_1_art_file_302613_tm8fj0.pdf` 为准。主要依据为 PDF 第 5–8 页的 Experimental design、Fig. 4（第 37 页）以及 Supplementary Fig. 1 的坐标约定。原 PDF 和冻结的 NAR 稿件未修改。

## 坐标与常规设计

Target RNA 按 5′→3′显示，目标 A 为 A0。输入序列位置为 1-based；相对 A0 的占位区间为闭区间。arRNA 与 target 反平行对齐，最终序列按 5′→3′导出。

| 项目 | 当前规则 |
| --- | --- |
| 统一设计 target 覆盖检查 | −6…+25；取 ADAR1 −4…+25 与 ADAR2 −6…+11 的并集 |
| 目标 mismatch | A0 对应 arRNA C |
| 上游 external bulge | 28/0，NP position −31，target 占位 −58…−31 |
| 下游 external bulge | 10/0，NP position +34，target 占位 +34…+43 |
| 可选 internal bulge | 1/0，+4；与未加入该结构的版本分别测试 |

默认 target 窗口为 −75…+75（151 nt）。删除 28+10 个 guide nt 后，dual-deletion guide 为 113 nt；额外删除 +4 后为 112 nt。网站默认选中可用的 dual-deletion；请求 +4 时优先选含 +4 的 dual-deletion。其余版本用于分别比较与基线对照。

窗口可以平移、缩短或延长。先验证统一设计所需的 target 覆盖；不满足时返回空候选及原因，页面不提供无效设计下载。窗口超出输入序列时按实际序列裁剪并提示。图示约 73–250 nt 是设计示例范围，不作为所有 target 的已验证硬性范围。

### 统一 ADAR 设计（2026-10-12，ruleset 0.3.0）

按用户要求取消 ADAR1/2 选择。上游结构使用 ADAR2 筛选数据，下游使用 ADAR1 筛选数据；保留四种默认候选以及 Advanced 自定义结构。旧分享链接中的 ADAR 选择不再改变新设计，API 接受旧 `ADAR1`/`ADAR2` 请求并统一为 `combined`。JSON 的 `pairing.bulge_sources` 记录来源，自定义结构逐项记录 `effect_data_environment`；无支持数据的结构保持 unknown。

Cell 正式全文（DOI `10.1016/j.cell.2026.04.047`）Figure 5J（期刊 p4368）比较 −31 的 28/0、+34 的 10/0 及双 bulge；p4370、Figures 5I/J 和 S13C/D 对被测 ADAR1、ADAR2 与混合背景有实验支持。这支持将该组合设为统一默认，不代表每个靶点都最优。全文：[实验室官网 PDF](https://weilab.pku.edu.cn/docs/2026-09/a73a8cf1d1ec4a76a74a0397289a0e44.pdf)。

最低覆盖 −6…+25 是软件取 Cell Figure 1F/G 的两个功能覆盖区间并集的保守条件，并非论文单独测得的统一阈值。既有 external 两侧 10 nt 互补检查保持不变。

手输模式可关闭 CDS 注释后设计一般 RNA，不再要求序列长度为 3 的倍数，也不推断氨基酸后果。开启 CDS 注释时要求输入为从阅读框起点开始的完整 CDS；NCBI 常规设计模式读取 CDS。GA/同义/非同义注释不替代实验可编辑性判断。

### Custom structures 入口（2026-10-12）

Advanced 移除独立的 `Optional +4 internal bulge` 开关，将新增入口统一放入 Custom structures。`+ External bulge` 提供 −31 的 28/0 和 +34 的 10/0 两个定稿预设；`+ Internal bulge` 默认添加 +4 的 1/0。已有结构不重复添加，窗口不足或与现有结构冲突时沿用现有校验。预设加入后，类型、大小及位置仍可手动编辑，Apply 才更新主结果。

每次成功应用自定义设计，Apply 都会在原候选组新增并选中一张编号 `Custom arRNA` 卡片，统一使用配对图、RNAfold 缩略图、序列与复制/下载。之前应用的自定义卡保留供比较；选择旧卡可查看其保存的设计或继续编辑，再次 Apply 新增卡片。Go 成功后清空所有自定义卡并恢复默认候选。Advanced 不再提供独立序列框或底部 Design notes 折叠提示，仍显示校验错误。JSON 保留每张自定义卡的结构及其来源快照，CSV 区分前端自定义构建与原设计服务。编码背景沿用输入来源或保存的链接，Advanced 不再提供手动编码开关。

来源为 final PDF 第 5–7 页、Fig. 4（第 37 页）：internal/external 指相对必要中央双链区域的位置分类，不等同于 deletion/insertion/mismatch 类型。定稿明确可比较 1/0、0/1、1/1 internal 结构；其余 external 替代配置列于 Table 1（第 43 页）。因此编辑器保留 n/0、0/n、n/n 三类机制，将 n/n 的通用名称改为 `Mismatch`，避免与内部 bulge 的位置分类混淆。新增按钮只预填定稿起点，不把预设当作所有可用配置或普适最优解。旧分享链接的 `includeInternalBulge` 仍可恢复；主页 Go 和恢复默认设置继续将其重置为 false。

### Final 稿件的 external flank 表述差异

第 6 页正文和 Fig. 4 尺寸标注写每侧 ≥5 nt，Fig. 4c 文本框写每侧 ≥10 nt。网站采用 **每侧 ≥10 个实际互补 nt**，同时满足两处条件；这属于处理 final 内部差异的保守实现决定，并非将 ≥10 nt 说成稿件中唯一的表述。页面高级参数中明确说明这一差异。

因此，上游 28/0 要求窗口至少到 −68，下游 10/0 至少到 +53。计数排除 deletion/mismatch/insertion 导致的不连续互补位置。target 覆盖长度、真正配对的臂长和最终 guide 长度分别显示。

## Exon skipping

优先对选定内部 exon 上游 splice acceptor 的 A 配置 A/C，初始 guide 长度 151 nt。Exon 分类固定为 <70、70–150、>150 nt，与用户调整的 guide 长度无关；分类提供设计背景，不自动决定额外 guide 的必要性。

使用 ESEfinder 3.0 的五组矩阵与对应阈值，优先含 A 的超阈值 motif。相互重叠的 motif 合并为候选区域；guide 覆盖整个区域。区域长于 guide 时按完整 motif 生成多个覆盖候选，分别记录完整、部分区域覆盖及完整 motif 覆盖，避免把“覆盖了其中的 A”写成“已覆盖该 ESE 区域”。

默认仅额外评估 SA 未充分覆盖的 ESE。SA 活性不足时，用户可勾选评估已被 SA 覆盖的 ESE，包括短 exon。可在指定 exon A 的 1-based 坐标添加 ESE A/C mismatch，结果记录实际添加的位置；未落入任何 ESE guide 的请求明确提示未应用。

Predicted ESE 是待实验验证的候选，不是已确认的功能性 enhancer。先单独测试 SA/ESE guide，再比较组合；控制总核酸剂量，分别测量编辑效率与 exon skipping。覆盖不足、低活性、功能区域干扰和结构因素仍须结合实验判断。

NCBI exon 模式支持显式 accession（包括版本号）；未指定时保留已有参考选择策略。手输序列不附上陈旧的 NCBI reference。JSON 保存 transcript、物种、gene、基因组 accession、方向、exon 边界、预测矩阵与阈值、设计选项、motif、区域、候选坐标及实际 mismatch。

## 实验反馈驱动优化

NP position 使用靠 A0 最近的 bulge 端点：负 position 的 n/0 或 n/n 结构向上游延伸，正 position 向下游延伸。例如 −31、28 nt → [−58,−31]。0/n 使用明确的 target 插入边界；表单碱基方向为对齐的 arRNA 3′→5′，导出会反转成 5′→3′。

对占位 [s,e] 内/外的任意被评估 A（坐标 c），效应距离为：

```text
d = c − clamp(c, s, e)
```

据此查询效应区间并绘制增/减范围，不统一用区间起点。前端数据表标为 `version=2`、`A_relative_to_nearest_bulge_edge`、`anchor=nearest-edge`；对应提取脚本输出元数据已同步。**431 个区间的数值、effect、分组与 1.2/0.8 阈值保持原样**，未平移或重拟合筛选数据。

手动设计支持 n/0 deletion、0/n insertion、n/n mismatch（含 A/G）。支持修改、移除已测试结构以生成下一轮提案。已测试的原始序列、结构和实验读数始终独立保存，不因应用推荐而恢复或覆盖当前提案。未支持的结构效应明确保持 unknown，不生成虚构箭头，也不纳入自动推荐。导入时，即使 insertion 与 deletion 相抵后 guide 与 target 总长度相同，也通过序列对齐推断结构；仅完整互补且 A0 对 C 的情况使用快捷路径。

A0 的测量值必填。未测量 bystander 保持 unknown，排除评分；实测 0% 是有效观测，二者不混用。定性方向来自单 bulge 筛选，不是所提多 bulge 结构的实测值或预测效率。

仍保留软件搜索与交互边界：最多 4 个结构、最多 10 个推荐及排序权重属于软件策略，不是 NP 生物学约束。自动推荐仅使用有支持数据的 mismatch/deletion。手动 export 验证 A0、target 必需覆盖、结构不重叠及 external 两侧互补；内部结构扰动提示需实验比较。

## 图与实现范围

常规预览、custom workflow、exon 预览和 Method 页规则面板直接使用 final Fig. 4 的原始嵌入像素。可用 `scripts/sync_protocol_design_panels.py` 从固定 PDF 重新提取。PNG 来自原图；同名 SVG 仅为包含原像素的容器，不是重新绘制的矢量图。旧 Illustrator 导出脚本不再覆盖这三张规则图。

常规初始设计支持可调窗口；已测试结构的 refinement 保留已导入的 target 窗口。若需改变这一窗口，应以新的明确 target–guide 配对进入下一轮设计。网站不执行 RNAfold，不模拟 RNA–protein 结合或 circularization，也不自动验证 U6 termination、构建骨架和细胞环境。Help 中要求检查 target 功能区、RNA 结构与线性/环状构建，并进行实际实验验证。

常规与 exon ruleset 均更新为 0.2.0。英文/中文参数及关键解释保持同步；分享链接保存新增选项，JSON 保留完整设计与证据，FASTA/CSV 提供序列和候选摘要。URL fragment 本身不会进入 HTTP request URL，但设计 API 会在 request body 中接收输入序列。

## 验证记录

2026-10-06 最终验证：

- Backend：`.venv/bin/python -m pytest -q`，44/44 通过；有两条现有依赖 deprecation warning。
- Frontend：初次规则对齐检查为 102/102；补齐教学例子后为 105/105；修复非法测量输入并增加四项回归后，最新完整检查为 109/109。`npm run build` 的 TypeScript 与 Vite 构建通过。
- Browser：`scripts/verify_protocol_smoke.mjs`，Chrome headless 退出码 0，9 组检查通过、无 pageerror。Normal/exon 设计请求使用真实本地后端；仅 NCBI 来源缓存测试的 reference 读取使用固定响应，未声称验证实时 NCBI 网络服务。
- 浏览器覆盖：默认 dual 113 nt、可选 +4 的 8 候选/112 nt、窗口平移、一般 RNA、覆盖不足空结果、短 exon 的 SA/额外 ESE 与 A/C、完整 JSON、未知/实测零/清空、基线与提案分离、手动负位置/插入/A/G、分享链接、中英文、NCBI 缓存清理及等长 indel 导入。
- 431 个规则区间与旧版本逐项比较，数值、effect、分组和阈值全部相同。三张 PNG 与 final PDF 对应区域逐像素一致。
- `git diff --check` 通过。Python 提取/生成脚本语法检查通过；Windows Illustrator 导出防覆盖逻辑仅静态复核，本机未运行 PowerShell/Illustrator COM。
- 独立交叉复核已完成。未部署或提交；验证的是当前本地实现与逻辑，不是新候选的生物学有效性。

浏览器脚本需可用的 Playwright 与 Chrome/Chromium，可通过 `MODULE_ROOT`、`CHROME_EXECUTABLE`、`FRONTEND_URL`、`BACKEND_URL` 和 `SCREENSHOT_DIR` 指定环境；默认设计请求转发到独立测试后端 8011，前端地址为 5174。

补充检查拒绝超出 0–100% 或非有限值的实验效率，不将其改写为实测 0/100；更换 A0 会重新初始化对应配对的结构和测量。完整测试、构建及真实 Chrome 原复现路径通过，见 V12 `qa/nar_refinement_additional_audit_20261006.*`。这些是软件数据完整性修复，不新增 protocol 的生物学约束。
