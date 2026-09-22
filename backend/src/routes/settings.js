"use strict";

const express = require("express");
const { publicSettings, saveSettings } = require("../store");
const { asyncHandler } = require("../http/async-handler");
const settingsService = require("../services/settings-service");

const router = express.Router();

router.get("/settings", (_req, res) => {
  res.json(publicSettings());
});

router.put("/settings", (req, res) => {
  res.json(saveSettings(req.body || {}));
});

router.post(
  "/settings/test",
  asyncHandler(async (req, res) => {
    const reply = await settingsService.testProvider(req.body?.provider);
    res.json({ ok: true, reply });
  })
);

router.post(
  "/settings/models",
  asyncHandler(async (req, res) => {
    const models = await settingsService.models(req.body || {});
    res.json({ models });
  })
);

router.post(
  "/settings/probe",
  asyncHandler(async (req, res) => {
    res.json(await settingsService.probe(req.body || {}));
  })
);

module.exports = router;
