// Desks: several separate sets of the app's data, each one a folder under a
// single parent folder (Documents/Question/<desk name>). Switching desks just
// points the app at a different folder — there is no database to migrate or
// connection to manage, since the Markdown files are the source of truth and
// the SQLite index is rebuilt from them on every write (see backend.cjs).
//
// Everything here is plain filesystem work with no Electron dependency, so it
// can be exercised directly with node (see docs/DESIGN.md).
"use strict";

const fs = require("fs");
const path = require("path");
const backend = require("./backend.cjs");

const MAX_NAME_LENGTH = 100;
const ILLEGAL_CHARS = /[\\/:*?"<>|\u0000-\u001f]/;
// Names Windows refuses (with or without an extension). Cheap to block
// everywhere, so a desk folder can be copied between machines.
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

// The desks under `parentDir`: only folders with the app's own structure.
// Anything else the user keeps there is ignored — never listed, never counted.
function listDesks(parentDir) {
  let entries;
  try {
    entries = fs.readdirSync(parentDir, { withFileTypes: true });
  } catch (e) {
    return [];
  }
  return entries
    .filter(e => e.isDirectory() || e.isSymbolicLink())
    .map(e => ({ name: e.name, path: path.join(parentDir, e.name) }))
    .filter(d => backend.isDataFolder(d.path))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function isDesk(parentDir, name) {
  return !!name && backend.isDataFolder(path.join(parentDir, name));
}

// Check a name for a new desk, or for renaming one. `ignoreName` is the desk
// being renamed, so it can be saved under the same name, or with only its
// capitalisation changed, without tripping the "already exists" rule.
// Returns { ok: true, name } (trimmed) or { ok: false, reason } where `reason`
// is text meant to be shown under the input.
function validateDeskName(parentDir, rawName, ignoreName) {
  const name = String(rawName == null ? "" : rawName).trim();
  if (!name) return { ok: false, reason: "Give the desk a name." };
  if (ILLEGAL_CHARS.test(name)) {
    return { ok: false, reason: 'Names can\'t contain \\ / : * ? " < > |' };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, reason: `Keep the name under ${MAX_NAME_LENGTH} characters.` };
  }
  if (name.endsWith(".")) return { ok: false, reason: "Names can't end with a dot." };
  if (WINDOWS_RESERVED.test(name)) return { ok: false, reason: "Windows reserves that name. Pick another." };

  const lower = name.toLowerCase();
  const ownLower = ignoreName ? ignoreName.toLowerCase() : null;
  if (lower !== ownLower) {
    if (listDesks(parentDir).some(d => d.name.toLowerCase() === lower)) {
      return { ok: false, reason: "You already have a desk with that name." };
    }
    // Not one of ours, but a folder with that name would still be in the way.
    let entries = [];
    try { entries = fs.readdirSync(parentDir); } catch (e) { /* parent doesn't exist yet */ }
    if (entries.some(n => n.toLowerCase() === lower)) {
      return { ok: false, reason: "There's already a folder with that name. Pick another." };
    }
  }
  return { ok: true, name };
}

function createDesk(parentDir, rawName) {
  const v = validateDeskName(parentDir, rawName, null);
  if (!v.ok) return v;
  const dir = path.join(parentDir, v.name);
  try {
    backend.ensureDataDirs(dir);
  } catch (e) {
    return { ok: false, reason: `Couldn't create the folder: ${e.message}` };
  }
  return { ok: true, name: v.name, path: dir };
}

// Rename a desk's folder. Nothing is held open between calls (the SQLite
// index is opened, written and closed inside each sync), so the rename is
// only ever blocked by something outside the app having the folder open.
function renameDesk(parentDir, oldName, rawNewName) {
  const v = validateDeskName(parentDir, rawNewName, oldName);
  if (!v.ok) return v;
  const from = path.join(parentDir, oldName);
  if (!backend.isDataFolder(from)) return { ok: false, reason: "missing" };
  if (v.name === oldName) return { ok: true, name: v.name, path: from, unchanged: true };
  const to = path.join(parentDir, v.name);
  try {
    fs.renameSync(from, to);
  } catch (e) {
    return {
      ok: false,
      reason: `Couldn't rename the folder. It may be open in another program. (${e.code || e.message})`,
    };
  }
  return { ok: true, name: v.name, path: to };
}

// ---- Last-opened desk ----
// A tiny settings file that lives outside the desk folders (main.cjs puts it
// in Electron's own app-data directory), so renaming or deleting a desk by
// hand never takes the setting with it.
function loadLastDesk(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return typeof data.lastDesk === "string" && data.lastDesk ? data.lastDesk : null;
  } catch (e) {
    return null;
  }
}

function saveLastDesk(file, name) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ lastDesk: name }, null, 2), "utf8");
  } catch (e) {
    console.error("Couldn't remember the last desk:", e);
  }
}

module.exports = {
  listDesks, isDesk, validateDeskName, createDesk, renameDesk,
  loadLastDesk, saveLastDesk,
};
