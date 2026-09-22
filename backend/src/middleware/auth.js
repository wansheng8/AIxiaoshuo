"use strict";

const crypto = require("crypto");

const ACCESS_PASSWORD = String(process.env.ACCESS_PASSWORD || "").trim();
const AUTH_COOKIE = "moshu_auth";
const AUTH_TOKEN = ACCESS_PASSWORD
  ? crypto.createHmac("sha256", ACCESS_PASSWORD).update("moshu-auth").digest("hex")
  : "";

function safeEqual(a, b) {
  const left = Buffer.from(String(a == null ? "" : a));
  const right = Buffer.from(String(b == null ? "" : b));
  if (left.length !== right.length || left.length === 0) return false;
  return crypto.timingSafeEqual(left, right);
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return "";
}

function authOk(req) {
  if (!ACCESS_PASSWORD) return true;
  if (safeEqual(req.get("x-access-password"), ACCESS_PASSWORD)) return true;
  return safeEqual(readCookie(req, AUTH_COOKIE), AUTH_TOKEN);
}

// 挂在 /api 下：放行 health 与 login，其余要求通过鉴权。
function requireAuth(req, res, next) {
  if (req.path === "/health" || req.path === "/login") return next();
  if (authOk(req)) return next();
  res.status(401).json({ error: "需要访问密码", code: "AUTH_REQUIRED" });
}

module.exports = {
  ACCESS_PASSWORD,
  AUTH_COOKIE,
  AUTH_TOKEN,
  safeEqual,
  readCookie,
  authOk,
  requireAuth,
};
