// Backend for "Question" — plain markdown+YAML-frontmatter files are the
// source of truth (data/questions/*.md, data/feature-requests/*.md); a
// disposable SQLite index (data/index.sqlite, via node:sqlite) is rebuilt
// from those files after every write, purely to make sorting/filtering/trend
// queries fast. Deleting index.sqlite and re-running rebuildIndex() must
// always reconstruct it losslessly from the files — that's the whole point
// of calling it disposable.
"use strict";

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const REQUESTS_DIR = "feature-requests";
const QUESTIONS_DIR = "questions";
const SETTINGS_FILE = "settings.json";
const INDEX_FILE = "index.sqlite";

function ensureDataDirs(dataDir) {
  fs.mkdirSync(path.join(dataDir, REQUESTS_DIR), { recursive: true });
  fs.mkdirSync(path.join(dataDir, QUESTIONS_DIR), { recursive: true });
}

// ---- Minimal YAML-frontmatter read/write (no external deps) ----
// Only needs to round-trip the flat, JSON-safe field types this app actually
// uses (strings, numbers, booleans, null, and string arrays), so a hand
// rolled reader/writer is enough — pulling in a real YAML library for that
// would be a dependency for no real gain in a zero-dependency project.
function stringifyFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      lines.push(`${key}: null`);
    } else if (Array.isArray(value)) {
      if (value.length === 0) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        value.forEach(v => lines.push(`  - ${JSON.stringify(v)}`));
      }
    } else if (typeof value === "string") {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n");
}

function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const [, fmText, body] = match;
  const data = {};
  const lines = fmText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const listHeaderMatch = /^(\w+):\s*$/.exec(line);
    if (listHeaderMatch) {
      const key = listHeaderMatch[1];
      const arr = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) {
        i++;
        const raw = lines[i].replace(/^\s*-\s+/, "");
        arr.push(safeJsonParse(raw));
      }
      data[key] = arr;
      continue;
    }
    const kvMatch = /^(\w+):\s*(.*)$/.exec(line);
    if (kvMatch) {
      const [, key, rawVal] = kvMatch;
      if (rawVal === "[]") data[key] = [];
      else if (rawVal === "null") data[key] = null;
      else data[key] = safeJsonParse(rawVal);
    }
  }
  return { data, body: body.replace(/^\n/, "") };
}

function safeJsonParse(raw) {
  try { return JSON.parse(raw); } catch (e) { return raw; }
}

// ---- Requests ----
function requestFilePath(dataDir, id) {
  return path.join(dataDir, REQUESTS_DIR, `${id}.md`);
}

function writeRequest(dataDir, req) {
  const { description, ...frontmatterFields } = req;
  const text = stringifyFrontmatter(frontmatterFields) + (description || "");
  fs.writeFileSync(requestFilePath(dataDir, req.id), text, "utf8");
}

function deleteRequestFile(dataDir, id) {
  const p = requestFilePath(dataDir, id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function readAllRequests(dataDir) {
  const dir = path.join(dataDir, REQUESTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, body } = parseFrontmatter(text);
      return { ...data, description: body.trimEnd() };
    });
}

// ---- Questions ----
function questionFilePath(dataDir, id) {
  return path.join(dataDir, QUESTIONS_DIR, `${id}.md`);
}

function writeQuestion(dataDir, q) {
  const { text, ...frontmatterFields } = q;
  const content = stringifyFrontmatter(frontmatterFields) + (text || "");
  fs.writeFileSync(questionFilePath(dataDir, q.id), content, "utf8");
}

function deleteQuestionFile(dataDir, id) {
  const p = questionFilePath(dataDir, id);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function readAllQuestions(dataDir) {
  const dir = path.join(dataDir, QUESTIONS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".md"))
    .map(f => {
      const content = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, body } = parseFrontmatter(content);
      return { ...data, text: body.trimEnd() };
    });
}

// ---- Settings (views, active view, score weights, theme — app
// preferences rather than PM data, kept in one small JSON file rather than
// as markdown+frontmatter records) ----
function loadSettings(dataDir) {
  const p = path.join(dataDir, SETTINGS_FILE);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (e) { return null; }
}

function saveSettings(dataDir, settings) {
  fs.writeFileSync(path.join(dataDir, SETTINGS_FILE), JSON.stringify(settings, null, 2), "utf8");
}

// ---- Full sync: given the renderer's complete in-memory arrays, make the
// files match exactly (write/update present ids, delete removed ones), then
// rebuild the index. Simpler and safer than tracking per-field diffs, and
// fast enough at beta-test data volumes (hundreds, not millions, of rows). ----
function syncAll(dataDir, requests, questions, settings) {
  ensureDataDirs(dataDir);

  const existingReqIds = new Set(
    fs.existsSync(path.join(dataDir, REQUESTS_DIR))
      ? fs.readdirSync(path.join(dataDir, REQUESTS_DIR)).filter(f => f.endsWith(".md")).map(f => f.slice(0, -3))
      : []
  );
  const nextReqIds = new Set(requests.map(r => r.id));
  for (const id of existingReqIds) if (!nextReqIds.has(id)) deleteRequestFile(dataDir, id);
  requests.forEach(r => writeRequest(dataDir, r));

  const existingQIds = new Set(
    fs.existsSync(path.join(dataDir, QUESTIONS_DIR))
      ? fs.readdirSync(path.join(dataDir, QUESTIONS_DIR)).filter(f => f.endsWith(".md")).map(f => f.slice(0, -3))
      : []
  );
  const nextQIds = new Set(questions.map(q => q.id));
  for (const id of existingQIds) if (!nextQIds.has(id)) deleteQuestionFile(dataDir, id);
  questions.forEach(q => writeQuestion(dataDir, q));

  if (settings) saveSettings(dataDir, settings);

  rebuildIndex(dataDir);
}

function loadAll(dataDir) {
  ensureDataDirs(dataDir);
  return {
    requests: readAllRequests(dataDir),
    questions: readAllQuestions(dataDir),
    settings: loadSettings(dataDir),
  };
}

// ---- Disposable SQLite index ----
// Rebuilt from the files on every sync — never hand-edited, never assumed to
// exist. Column set matches what the priority-score and trend queries need:
// request table with typed sort keys, a customers join table (many-to-many),
// and a questions table with the request it's matched to.
function rebuildIndex(dataDir) {
  const indexPath = path.join(dataDir, INDEX_FILE);
  if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
  const db = new DatabaseSync(indexPath);
  db.exec(`
    CREATE TABLE requests (
      id TEXT PRIMARY KEY, title TEXT, status TEXT, urgency TEXT, topic TEXT,
      quarter TEXT, due_date INTEGER, created_at INTEGER, updated_at INTEGER,
      question_count INTEGER, shipped INTEGER
    );
    CREATE TABLE request_customers (request_id TEXT, customer TEXT);
    CREATE TABLE questions (
      id TEXT PRIMARY KEY, text TEXT, matched_request_id TEXT,
      answer TEXT, created_at INTEGER
    );
    CREATE INDEX idx_req_customers ON request_customers(customer);
    CREATE INDEX idx_questions_matched ON questions(matched_request_id);
  `);

  const insertReq = db.prepare(`INSERT INTO requests
    (id, title, status, urgency, topic, quarter, due_date, created_at, updated_at, question_count, shipped)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertCust = db.prepare(`INSERT INTO request_customers (request_id, customer) VALUES (?, ?)`);
  const insertQ = db.prepare(`INSERT INTO questions (id, text, matched_request_id, answer, created_at) VALUES (?, ?, ?, ?, ?)`);

  const requests = readAllRequests(dataDir);
  requests.forEach(r => {
    insertReq.run(
      r.id, r.title, r.status, r.urgency, r.topic || null, r.quarter || null,
      r.dueDate || null, r.createdAt, r.updatedAt, r.questionCount || 0, r.shipped ? 1 : 0
    );
    (r.customers || []).forEach(c => insertCust.run(r.id, c));
  });
  readAllQuestions(dataDir).forEach(q => {
    insertQ.run(q.id, q.text, q.matchedRequestId || null, q.answer || null, q.createdAt);
  });

  db.close();
}

module.exports = { loadAll, syncAll, rebuildIndex, ensureDataDirs };
