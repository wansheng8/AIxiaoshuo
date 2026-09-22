const express = require("express");
const { listElements, createElement, updateElement, deleteElement, resetElement } = require("../elements");

const router = express.Router();

router.get("/elements", (_req, res) => {
  res.json(listElements());
});

router.post("/elements", (req, res) => {
  try {
    res.status(201).json(createElement(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put("/elements/:id", (req, res) => {
  try {
    res.json(updateElement(req.params.id, req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/elements/:id/reset", (req, res) => {
  try {
    res.json(resetElement(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/elements/:id", (req, res) => {
  try {
    res.json(deleteElement(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
