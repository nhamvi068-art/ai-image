# OpenTu — 本地优先 AI 生图对话

极简 AI 对话生图 Web SPA，图片与对话数据完全存储在本地浏览器（IndexedDB + Blob），零后端，可直接部署至 Vercel。

## 技术栈

| 类别 | 技术 |
|------|------|
| 前端框架 | React 18 + TypeScript |
| 构建工具 | Vite |
| 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 本地存储 | Dexie.js (IndexedDB) |
| 图标 | lucide-react |
| 虚拟列表 | react-virtuoso (预留) |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器 (npm start 映射到 vite)
npm start
```

## 项目结构

```
src/
├── db/
│   └── db.ts                  # Dexie 数据库：sessions + messages 表，Blob 存储
├── services/
│   └── ai/
│       ├── types.ts           # GenerateImageParams / GenerateImageResponse / ModelConfig
│       ├── BaseModelAdapter.ts # 抽象基类，定义 generate() 合约
│       ├── ModelRegistry.ts   # 工厂：根据 modelId 分发 Adapter 实例
│       └── adapters/
│           ├── DalleAdapter.ts # DALL·E 3 适配器（stub）
│           └── SDAdapter.ts    # Stable Diffusion XL 适配器（stub）
├── store/
│   └── chatStore.ts           # Zustand store：会话、消息、sendMessage 核心流程
├── components/
│   ├── Sidebar.tsx            # 隐藏式侧边栏（含新建/切换/删除会话）
│   ├── ChatArea.tsx           # 全屏消息流（virtuoso 预留接入点）
│   └── InputBar.tsx           # 磨砂玻璃底部输入框
├── App.tsx
└── main.tsx
```

## 核心设计

### 1. Blob 直存（防卡顿）

Dexie `messages` 表的 `content` 字段类型为 `string | Blob`。图片生成后直接将 `Blob` 存入 IndexedDB，不经过任何 base64 编码，避免内存爆炸。

```ts
// db.ts — 存储 Blob
await addMessage({
  sessionId,
  role: 'assistant',
  type: 'image',
  content: blob,   // ← raw Blob，零 base64
  modelId: selectedModelId,
  createdAt: new Date(),
})
```

### 2. 策略模式解耦（多模型扩展）

```
ModelRegistry.resolveModelAdapter(modelId)
    │
    ├── 'dall-e-3'          → DalleAdapter.generate()
    └── 'stable-diffusion-xl' → SDAdapter.generate()
```

新增模型只需：
1. 在 `src/services/ai/adapters/` 创建 `XxxAdapter.ts`
2. 实现 `BaseModelAdapter` 抽象类
3. 在 `ModelRegistry.ts` 的 `ADAPTER_MAP` 注册一行

### 3. sendMessage 核心流程

```
用户提交 prompt
    │
    ▼
① addMessage(user text)  →  Dexie (persisted)
    │
    ▼
② resolveModelAdapter(selectedModelId)
    │
    ▼
③ adapter.generate({ prompt })  →  Blob
    │
    ▼
④ addMessage(assistant image blob)  →  Dexie (persisted)
    │
    ▼
⑤ Zustand state update  →  UI re-render
```

## 部署 Vercel

```bash
npm run build   # tsc && vite build
```

Vercel 自动识别 `vercel.json`（无需额外配置，`vite build` 输出 `dist/` 即兼容）。

## 环境变量（接入真实 API 时使用）

```env
# .env.local
VITE_DALLE_API_KEY=sk-...
VITE_SD_API_URL=http://localhost:7860
```

> 当前所有 Adapter 均为模拟 stub，替换 `generate()` 方法内的 `fetch` 调用即可接入真实 API。
