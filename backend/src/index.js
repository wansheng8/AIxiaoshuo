require("./env").loadEnv();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { ApiError } = require("./http/async-handler");
const { requireAuth } = require("./middleware/auth");
const { ensureDirs } = require("./store");
const authRouter = require("./routes/auth");
const settingsRouter = require("./routes/settings");
const projectsRouter = require("./routes/projects");
const skillsRouter = require("./routes/skills");
const elementsRouter = require("./routes/elements");
const voiceRouter = require("./routes/voice");
const generateRouter = require("./routes/generate");
const teardownsRouter = require("./routes/teardowns");
const chatRouter = require("./routes/chat");

const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "16mb" }));

app.use("/api", authRouter);
app.use("/api", requireAuth);
app.use("/api", settingsRouter);
app.use("/api", projectsRouter);
app.use("/api", skillsRouter);
app.use("/api", elementsRouter);
app.use("/api", voiceRouter);
app.use("/api", generateRouter);
app.use("/api", teardownsRouter);
app.use("/api", chatRouter);

const DIST_DIR = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

app.use((err, _req, res, _next) => {
  const status = Number(err && err.status) || 500;
  if (status >= 500) console.error("[api]", err && err.stack ? err.stack : err);
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* 连接已关闭 */
    }
    return;
  }
  if (err instanceof ApiError) {
    res.status(status).json({ error: err.message, ...(err.extra || {}) });
    return;
  }
  res.status(status).json({ error: (err && err.message) || "服务器错误" });
});

ensureDirs();

module.exports = app;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`moshu backend on ${PORT}`);
    const skillsDir = path.resolve(__dirname, "../../skills/builtin");
    if (!fs.existsSync(skillsDir)) {
      console.warn(`[moshu] 未找到内置 Skill 目录：${skillsDir}，部署时请带上 skills/builtin，否则无可用 Skill`);
    }
  });
}
