"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// The renderer only ever gets these two calls — everything else (parsing
// frontmatter, writing files, rebuilding the SQLite index) stays in the main
// process, out of reach of whatever runs in the page.
contextBridge.exposeInMainWorld("questionAPI", {
  loadAll: () => ipcRenderer.invoke("question:loadAll"),
  syncAll: (payload) => ipcRenderer.invoke("question:syncAll", payload),
});
