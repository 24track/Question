"use strict";

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const os = require("os");
const backend = require("./src/backend.cjs");
const desks = require("./src/desks.cjs");

// Data lives in visible folders under Documents, not hidden app-support —
// so a beta tester can find, back up, or inspect their own data directly.
//
// Each "desk" is one folder of the app's plain files, directly under
// Documents/Question (see src/desks.cjs). QUESTION_DESKS_DIR moves that
// parent folder (handy for trying the app without touching real data);
// unset, it's Documents/Question.
const DESKS_DIR = process.env.QUESTION_DESKS_DIR
  ? path.resolve(process.env.QUESTION_DESKS_DIR)
  : path.join(os.homedir(), "Documents", "Question");

// Which desk is open, and which one the user last had open. Resolved in
// whenReady() / startDesks() below; null activeDesk means "show the picker".
let activeDesk = null;
let missingDesk = null;   // last desk whose folder couldn't be found, for the picker's message
let lastDeskEver = null;  // last desk name ever saved (null = this machine has never opened one)
let pendingSwitch = null; // name of the desk just switched to, reported once so the page can say so after it reloads
let DESKS_SETTINGS = null;

// The last-opened-desk setting (desks.json) lives in Electron's own per-user
// app-support directory, not in a desk folder, so it survives a desk's folder
// being moved or deleted. app.getPath() isn't safe to call before the app is
// ready, so it's resolved inside whenReady() below, ahead of window creation
// and the IPC handlers that read it.

function activeDir() {
  return path.join(DESKS_DIR, activeDesk);
}

// Decide what to open at launch: the last desk, straight away, or the picker
// if there isn't one or its folder has gone.
function startDesks() {
  lastDeskEver = desks.loadLastDesk(DESKS_SETTINGS);
  activeDesk = null;
  missingDesk = null;
  if (lastDeskEver) {
    if (desks.isDesk(DESKS_DIR, lastDeskEver)) activeDesk = lastDeskEver;
    else missingDesk = lastDeskEver;
  }
}

// The active desk's folder can disappear while the app is running (deleted or
// renamed by hand). Everything that touches disk checks first and falls back
// to the picker instead of quietly recreating the folder.
function ensureActiveDeskPresent() {
  if (!activeDesk) return false;
  if (desks.isDesk(DESKS_DIR, activeDesk)) return true;
  missingDesk = activeDesk;
  activeDesk = null;
  return false;
}

function openDesk(name) {
  activeDesk = name;
  missingDesk = null;
  lastDeskEver = name;
  desks.saveLastDesk(DESKS_SETTINGS, name);
  pendingSwitch = name;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Belt-and-braces CSP enforcement in addition to the page's own <meta> tag —
  // this is what was flagged as a known gap ("no CSP set yet") before.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
          "font-src https://fonts.gstatic.com; " +
          "script-src 'self' 'unsafe-inline'; " +
          "connect-src 'self';",
        ],
      },
    });
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  DESKS_SETTINGS = path.join(app.getPath("userData"), "desks.json");
  startDesks();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC: the renderer's only way to touch disk. The data handlers are
// synchronous file/SQLite work wrapped in invoke/handle (async over IPC),
// matching the renderer's fire-and-forget saveState() and one-shot startup
// load — see renderer/index.html's loadState()/saveState(). They always work
// on whichever desk is open; the renderer never sends a path. Messages are
// handled in the order they arrive, so a save sent just before a desk switch
// finishes before the switch happens. ----
ipcMain.handle("question:loadAll", () => {
  if (!ensureActiveDeskPresent()) return { noDesk: true };
  return backend.loadAll(activeDir());
});

ipcMain.handle("question:syncAll", (event, { requests, questions, settings }) => {
  if (!ensureActiveDeskPresent()) return { ok: false, reason: "no-desk", missing: missingDesk };
  backend.syncAll(activeDir(), requests, questions, settings);
  return { ok: true };
});

// ---- Desks ----
ipcMain.handle("desks:status", () => {
  const present = ensureActiveDeskPresent();
  const list = desks.listDesks(DESKS_DIR);
  const switchedTo = pendingSwitch;
  pendingSwitch = null;
  return {
    mode: present ? "desk" : "picker",
    sep: path.sep,
    activeDesk: present ? activeDesk : null,
    activePath: present ? activeDir() : null,
    desks: list,
    missingDesk: present ? null : missingDesk,
    // Nothing opened on this machine yet and nothing in the folder either.
    firstLaunch: !present && !lastDeskEver && list.length === 0,
    switchedTo,
  };
});

ipcMain.handle("desks:list", () => ({ desks: desks.listDesks(DESKS_DIR), activeDesk }));

ipcMain.handle("desks:validate", (event, { name, ignoreName }) =>
  desks.validateDeskName(DESKS_DIR, name, ignoreName || null));

// Opening a desk that has since vanished falls back to the picker (the page
// reloads whatever the answer, and lands there).
ipcMain.handle("desks:open", (event, { name }) => {
  if (!desks.isDesk(DESKS_DIR, name)) {
    activeDesk = null;
    missingDesk = name;
    return { ok: false, reason: "missing" };
  }
  openDesk(name);
  return { ok: true, name };
});

ipcMain.handle("desks:create", (event, { name }) => {
  const res = desks.createDesk(DESKS_DIR, name);
  if (res.ok) openDesk(res.name);
  return res;
});

// Rename always applies to the desk that's open.
ipcMain.handle("desks:rename", (event, { name }) => {
  if (!ensureActiveDeskPresent()) return { ok: false, reason: "missing" };
  const res = desks.renameDesk(DESKS_DIR, activeDesk, name);
  if (res.ok && !res.unchanged) {
    activeDesk = res.name;
    lastDeskEver = res.name;
    desks.saveLastDesk(DESKS_SETTINGS, res.name);
  }
  if (!res.ok && res.reason === "missing") {
    missingDesk = activeDesk;
    activeDesk = null;
  }
  return res;
});
