"use strict";

const express = require("express");
const { previewPrompt } = require("../services/prompt-service");
const { generate } = require("../services/generation-service");

const router = express.Router();

router.post("/prompt/preview", previewPrompt);
router.post("/generate", generate);

module.exports = router;
