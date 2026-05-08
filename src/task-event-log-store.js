"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const DEFAULT_READ_LIMIT = 500;

async function readRecentLinesFromTail(filePath, limit) {
  const maxLines = Math.max(1, Number(limit) || DEFAULT_READ_LIMIT);
  const handle = await fs.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (!stat || stat.size <= 0) return [];

    const chunkSize = 64 * 1024;
    const chunks = [];
    let position = stat.size;
    let newlineCount = 0;

    while (position > 0 && newlineCount <= maxLines) {
      const size = Math.min(chunkSize, position);
      position -= size;
      const buffer = Buffer.allocUnsafe(size);
      const { bytesRead } = await handle.read(buffer, 0, size, position);
      if (bytesRead <= 0) break;
      const slice = buffer.subarray(0, bytesRead);
      chunks.push(slice);
      for (let i = 0; i < bytesRead; i += 1) {
        if (slice[i] === 10) newlineCount += 1;
      }
    }

    const raw = Buffer.concat(chunks.reverse()).toString("utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return lines.slice(-maxLines);
  } finally {
    await handle.close().catch(() => {});
  }
}

function normalizeTaskEventEntry(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const extra = src.extra && typeof src.extra === "object" ? { ...src.extra } : null;
  const entry = {
    time: src.time ? String(src.time) : new Date().toISOString(),
    level: src.level ? String(src.level) : "info",
    message: src.message ? String(src.message) : "",
  };
  if (src.cycleId) entry.cycleId = String(src.cycleId);
  if (src.cycleSeq != null) entry.cycleSeq = Number(src.cycleSeq) || 0;
  if (src.category) entry.category = String(src.category);
  if (src.taskId) entry.taskId = String(src.taskId);
  if (src.taskLabel) entry.taskLabel = String(src.taskLabel);
  if (extra && Object.keys(extra).length > 0) entry.extra = extra;
  return entry;
}

function formatTaskEventTextLine(raw) {
  const entry = normalizeTaskEventEntry(raw);
  const parts = [];
  parts.push(`[${entry.time}]`);
  parts.push(`[${entry.level}]`);
  if (entry.taskLabel) {
    parts.push(`[${entry.taskLabel}]`);
  } else if (entry.taskId) {
    parts.push(`[${entry.taskId}]`);
  }
  parts.push(entry.message);
  return parts.join(" ");
}

class TaskEventLogStore {
  constructor(projectRoot) {
    const root = projectRoot ? path.resolve(projectRoot) : path.resolve(__dirname, "..");
    this.filePath = path.join(root, "data", "task-events.ndjson");
    this.appendChain = Promise.resolve();
  }

  async append(raw) {
    const entry = normalizeTaskEventEntry(raw);
    const line = JSON.stringify(entry) + "\n";
    this.appendChain = this.appendChain
      .catch(() => {})
      .then(async () => {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.appendFile(this.filePath, line, "utf8");
      });
    await this.appendChain;
    return entry;
  }

  async readRecent(limit = DEFAULT_READ_LIMIT) {
    try {
      const lines = await readRecentLinesFromTail(this.filePath, limit);
      return lines
        .map((line) => {
          try {
            return normalizeTaskEventEntry(JSON.parse(line));
          } catch (_) {
            return null;
          }
        })
        .filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  async exportText(limit = DEFAULT_READ_LIMIT) {
    const entries = await this.readRecent(limit);
    return entries.map((entry) => formatTaskEventTextLine(entry)).join("\n");
  }

  async exportJson(limit = DEFAULT_READ_LIMIT) {
    const entries = await this.readRecent(limit);
    return JSON.stringify(entries, null, 2);
  }
}

module.exports = {
  TaskEventLogStore,
  formatTaskEventTextLine,
  normalizeTaskEventEntry,
};
