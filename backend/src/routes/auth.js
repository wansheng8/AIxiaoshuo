"use strict";

const express = require("express");
const {
  ACCESS_PASSWORD,
  AUTH_COOKIE,
  AUTH_TOKEN,
  safeEqual,
  authOk,
} = require("../middleware/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  if (!ACCESS_PASSWORD) return res.json({ ok: true, required: false });
  const password = req.body && req.body.password;
  if (!safeEqual(password, ACCESS_PASSWORD)) {
    return res.status(401).json({ ok: false, error: "访问密码不正确" });
  }
  res.setHeader(
    "Set-Cookie",
    `${AUTH_COOKIE}=${AUTH_TOKEN}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
  );
  res.json({ ok: true, required: true });
});

router.get("/auth", (req, res) => {
  res.json({ required: Boolean(ACCESS_PASSWORD), ok: authOk(req) });
});

router.get("/health", (_req, res) => {
  res.json({ ok: true, name: "moshu" });
});

module.exports = router;
