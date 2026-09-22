"use strict";

const { recordProbe } = require("../store");
const { testChat, listModels, probeModel } = require("../llm");
const { ApiError } = require("../http/async-handler");

async function testProvider(provider) {
  try {
    return await testChat(provider);
  } catch (err) {
    throw new ApiError(err.status || 500, err.message, { ok: false });
  }
}

async function models(body) {
  try {
    return await listModels(body || {});
  } catch (err) {
    throw new ApiError(err.status || 500, err.message);
  }
}

async function probe(body) {
  const input = body || {};
  try {
    const result = await probeModel(input);
    const providerId = String(input.providerId || "").trim();
    let probe = null;
    if (providerId && !providerId.startsWith("tmp_")) {
      probe = recordProbe(providerId, input.model, result);
    }
    if (probe) result.at = probe.at;
    return { ...result, model: String(input.model || "").trim(), providerId };
  } catch (err) {
    throw new ApiError(err.status || 500, err.message, { ok: false, code: err.code || "" });
  }
}

module.exports = { testProvider, models, probe };
