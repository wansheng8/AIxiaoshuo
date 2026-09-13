const CURRENT_VERSIONS = {
  novel: 2,
  teardown: 2,
  settings: 2,
  voice: 2,
  elements: 2,
};

const MIGRATIONS = {
  novel: {
    2: (doc) => ({ ...doc, rev: Number(doc && doc.rev) > 0 ? Math.round(Number(doc.rev)) : 1 }),
  },
  teardown: {
    2: (doc) => ({ ...doc, chapters: Array.isArray(doc && doc.chapters) ? doc.chapters : [] }),
  },
  voice: {
    2: (doc) => ({ ...doc, revisions: Array.isArray(doc && doc.revisions) ? doc.revisions : [] }),
  },
  settings: { 2: (doc) => doc },
  elements: { 2: (doc) => doc },
};

function currentVersion(kind) {
  return CURRENT_VERSIONS[kind] || 1;
}

function versionOf(doc) {
  const n = Number(doc && doc.schemaVersion);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
}

function migrate(kind, doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { doc, changed: false };
  }
  const target = currentVersion(kind);
  let version = versionOf(doc);
  const chain = MIGRATIONS[kind] || {};
  let out = doc;
  let ran = false;
  while (version < target) {
    const step = chain[version + 1];
    if (typeof step === "function") out = step(out) || out;
    version += 1;
    ran = true;
  }
  const changed = ran || versionOf(out) !== target;
  if (changed) out = { ...out, schemaVersion: target };
  return { doc: out, changed };
}

function stamp(kind, doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc;
  return { ...doc, schemaVersion: currentVersion(kind) };
}

module.exports = { CURRENT_VERSIONS, currentVersion, versionOf, migrate, stamp };
