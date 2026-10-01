"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// The renderer never gets a file path or any other way to reach disk — only
// these calls. Everything else (parsing frontmatter, writing files, rebuilding
// the SQLite index, listing and renaming desk folders) stays in the main
// process, out of reach of whatever runs in the page.
contextBridge.exposeInMainWorld("questionAPI", {
  // The open desk's data
  loadAll: () => ipcRenderer.invoke("question:loadAll"),
  syncAll: (payload) => ipcRenderer.invoke("question:syncAll", payload),
  // Desks (see src/desks.cjs)
  deskStatus: () => ipcRenderer.invoke("desks:status"),
  deskList: () => ipcRenderer.invoke("desks:list"),
  deskValidate: (name, ignoreName) => ipcRenderer.invoke("desks:validate", { name, ignoreName }),
  deskOpen: (name) => ipcRenderer.invoke("desks:open", { name }),
  deskCreate: (name) => ipcRenderer.invoke("desks:create", { name }),
  deskRename: (name) => ipcRenderer.invoke("desks:rename", { name }),
});
