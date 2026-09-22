"use strict";

const MAX_TEXT_CHARS = 200000;

function capText(value, limit = MAX_TEXT_CHARS) {
  const text = value == null ? "" : String(value);
  return text.length > limit ? text.slice(0, limit) : text;
}

module.exports = { MAX_TEXT_CHARS, capText };
