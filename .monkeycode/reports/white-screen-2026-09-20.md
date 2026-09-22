# 白屏问题排查记录（2026-09-20）

## 现象

用户反馈预览站点打开后白屏（HTML 能返回 200，但页面空白）。

## 排查环境

- 服务端：`ss -ltnp` 确认 5173（Vite dev）与 8787（后端）均在监听；`curl` 本地与预览域名都返回 200；`POST /api/login` 正常。
- 前端运行时：本机无浏览器，改用 Node 22 + jsdom 跑打包后的前端（`esbuild --bundle --format=iife`，注入登录 Cookie 与 `/api` 代理），捕获未处理异常。

## 复现结果

- 首页 `/`：渲染正常，0 错误。
- 主台 `/studio/<真实工程 id>`：**崩溃**，报错
  ```
  TypeError: readerShellRef.current?.scrollTo is not a function
  ```
  该错误发生在 `useEffect`（章节切换时滚动到顶部），因没有错误边界，React 卸载整棵树 → 白屏。
- 说明：现代桌面浏览器 `Element.prototype.scrollTo` 存在，所以本地桌面看不出来；移动端 / 较旧的 WebView 缺少该方法时每次切章都会崩，与「手机端白屏」吻合。
- 复查其它路由（`/settings`、`/skills`、`/voice`、`/teardown`、`/teardown/<id>`）在补齐 `ResizeObserver`/`IntersectionObserver`/`scrollTo` 等 API 后均 0 错误。

## 修复

1. 滚动调用全部改为可选调用，缺失时不抛错：
   - `Studio.tsx`：`readerShellRef.current?.scrollTo?.(...)`、`scrollIntoView?.(...)`
   - `TeardownDesk.tsx`：`scrollIntoView?.(...)`
   - `components/StageFlow.tsx`：`activeRef.current.scrollIntoView?.(...)`
2. 新增 `frontend/src/ErrorBoundary.tsx`，在 `main.tsx` 最外层包裹，任何未捕获错误改为显示可读信息 + 「重新加载 / 返回首页」，不再整页白屏。

## 二次复查

- 重新打包后用 jsdom 复跑主台路由：**0 错误，DOM 正常渲染**。
- `tsc --noEmit` / `vite build` 通过。
