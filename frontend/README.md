# Frontend

推荐使用 React + TypeScript + Vite + Tailwind CSS。

首个实现迭代包含：

```text
src/
├── app/                 router、providers、query client
├── features/
│   ├── sequence-input/
│   ├── gene-search/
│   ├── transcript-viewer/
│   ├── editing-config/
│   ├── task-status/
│   └── results/
├── components/          通用无业务组件
├── api/                 由 OpenAPI 生成的 client
├── styles/              design tokens
└── pages/
```

在产品流程和 API 契约确认前，不提前生成大量 UI 模板代码。交互规格见
`../docs/PRODUCT_SPEC.md`。
