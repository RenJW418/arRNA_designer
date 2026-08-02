# ADR-0001：前后端分离的模块化单体

- 状态：Accepted
- 日期：2026-07-28

## Context

产品需要复杂科研可视化、Python 分析、NCBI 集成和未来商业化，但首版团队规模和负载未知。

## Decision

采用 React 静态前端 + FastAPI 模块化单体。分析、NCBI、坐标和任务以 Python
接口隔离，但部署为一个 API 容器；长任务使用同一镜像的 Cloud Run Job。

## Consequences

优点是交付快、部署少、模块可测试且不锁死算法。代价是 API 与任务代码共享发布周期；
当任务量、权限或团队边界明确后再拆服务。

## Alternatives

- Streamlit：快但产品体验和长期状态管理不足。
- 微服务：当前会增加网络、部署、追踪和数据一致性成本。
