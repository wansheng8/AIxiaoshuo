"use strict";

const express = require("express");
const { chat } = require("../services/chat-service");

const router = express.Router();

router.post("/chat", chat);

module.exports = router;
