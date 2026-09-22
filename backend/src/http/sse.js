"use strict";

// SSE 响应头 + 首包语义集中在此，保持原有 header 顺序与 writableEnded 判定。
function openSse(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function writeSse(res, payload) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// 客户端断开时中止上游请求；只有响应未结束时才 abort。
function abortOnClose(res, controller) {
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
}

module.exports = { openSse, writeSse, abortOnClose };
