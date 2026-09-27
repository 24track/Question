"use strict";

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const os = require("os");
const backend = require("./src/backend.cjs");

// Data lives in a visible folder under Documents, not hidden app-support —
// so a beta tester can find, back up, or inspect their own data directly.
const DATA_DIR = path.join(os.homedir(), "Documents", "Question Data");

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
  backend.ensureDataDirs(DATA_DIR);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC: the renderer's only way to touch disk. Both handlers are
// synchronous file/SQLite work wrapped in invoke/handle (async over IPC),
// matching the renderer's fire-and-forget saveState() and one-shot startup
// load — see renderer/index.html's loadState()/saveState(). ----
ipcMain.handle("question:loadAll", () => {
  return backend.loadAll(DATA_DIR);
});

ipcMain.handle("question:syncAll", (event, { requests, questions, settings }) => {
  backend.syncAll(DATA_DIR, requests, questions, settings);
  return { ok: true };
});
