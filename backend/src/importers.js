function countWords(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function stripChapterPrefix(title) {
  return String(title || "")
    .replace(/^#+\s*/, "")
    .replace(/^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章(?:\s*[·•、.:：\-—]\s*|\s+)?/, "")
    .trim();
}

function isChapterHeading(text) {
  const value = String(text || "").replace(/^#+\s*/, "").trim();
  return (
    /^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*[章节回]/.test(value) ||
    /^Chapter\s+\d+/i.test(value)
  );
}

function splitByWords(text, size) {
  const chunks = [];
  let buf = "";
  let count = 0;
  for (const ch of Array.from(String(text || ""))) {
    buf += ch;
    if (!/\s/.test(ch)) count += 1;
    if (count >= size) {
      chunks.push(buf);
      buf = "";
      count = 0;
    }
  }
  if (buf.trim()) chunks.push(buf);
  return chunks;
}

function parseManuscript(markdown, opts = {}) {
  const raw = String(markdown || "").replace(/^\uFEFF/, "").trim();
  if (!raw) {
    const error = new Error("空文件，没有可导入的正文");
    error.status = 400;
    throw error;
  }
  const lines = raw.split(/\r?\n/);
  let title = "";
  const preamble = [];
  const chapters = [];
  let current = null;

  const startChapter = (heading) => {
    if (current) chapters.push(current);
    current = { title: stripChapterPrefix(heading), body: [] };
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const h1 = trimmed.match(/^#\s+(?!#)(.+)$/);
    if (h1 && !current && !title && !/^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章/.test(h1[1])) {
      title = h1[1].trim();
      continue;
    }
    const hashed = trimmed.match(/^#{1,3}\s+(.+)$/);
    const heading = hashed ? hashed[1].trim() : trimmed;
    if (isChapterHeading(heading) && (!current || current.body.join("").trim() || hashed)) {
      startChapter(trimmed);
      continue;
    }
    if (!current) preamble.push(line);
    else current.body.push(line);
  }
  if (current) chapters.push(current);
  if (!chapters.length) {
    if (opts.splitEmpty) {
      splitByWords(raw, 3000).forEach((chunk, index) => {
        chapters.push({ title: `第${index + 1}节`, body: chunk.split(/\r?\n/) });
      });
    } else {
      chapters.push({ title: "", body: raw.split(/\r?\n/) });
    }
  }

  const logline = preamble
    .map((row) => row.trim())
    .filter((row) => row && !row.startsWith("#"))
    .join(" ")
    .slice(0, 160);

  let bodies = chapters.map((ch) => ({
    title: ch.title || "",
    content: ch.body.join("\n").trim(),
  }));
  const nonEmpty = bodies.filter((ch) => ch.content);
  if (nonEmpty.length) bodies = nonEmpty;

  return {
    title: title || bodies[0]?.title || "导入稿本",
    logline,
    chapters: bodies.map((ch, index) => ({
      title: ch.title || "",
      content: ch.content,
      index: index + 1,
    })),
  };
}

module.exports = { parseManuscript, countWords, stripChapterPrefix, splitByWords };
