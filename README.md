# LEAPER arRNA Designer

面向科研用户的 LEAPER arRNA 设计与序列分析 Web 工具。

当前仓库包含产品规划、系统架构、API 契约和可继续开发的前后端骨架。arRNA
设计算法目前故意保留为空接口，后续可在不改变 API 的情况下补充。

## 推荐部署

- Frontend：React + TypeScript + Vite + Tailwind CSS → Cloudflare Pages
- Backend：FastAPI + Python 3.12 → Google Cloud Run
- Metadata：Supabase Postgres
- Temporary data：容器临时目录；默认 24 小时内删除
- Long jobs：Cloud Run Jobs（第二阶段启用）
- DNS/HTTPS：Cloudflare DNS + 自动 TLS

## 目录

```text
website/
├── backend/                 FastAPI 与分析模块边界
├── frontend/                React 前端工程入口
├── docs/
│   ├── adr/                 架构决策记录
│   ├── ARCHITECTURE.md      总体架构与平台比较
│   ├── PRODUCT_SPEC.md      产品、页面和用户流程
│   ├── DATA_AND_API.md      坐标模型、数据模型与 API
│   ├── DEPLOYMENT.md        云部署、域名和数据清理
│   └── MVP_PLAN.md          7 天上线计划与商业化路线
├── .env.example
├── .gitignore
└── docker-compose.yml       本地开发
```

## 本地启动

```bash
docker compose up --build
```

后端健康检查：`http://localhost:8000/health`

详细设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
