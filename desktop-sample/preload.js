"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("farmDesktop", {
  getSnapshot: () => ipcRenderer.invoke("desktop:get-snapshot"),
  setRuntimeSelection: (runtimeKey) => ipcRenderer.invoke("desktop:set-runtime", runtimeKey),
  startService: (runtimeKey) => ipcRenderer.invoke("desktop:start-service", runtimeKey),
  stopService: () => ipcRenderer.invoke("desktop:stop-service"),
  startAutoFarm: () => ipcRenderer.invoke("desktop:start-auto-farm"),
  stopAutoFarm: () => ipcRenderer.invoke("desktop:stop-auto-farm"),
  openSettings: () => ipcRenderer.invoke("desktop:open-settings"),
  closeWindow: () => ipcRenderer.invoke("desktop:close-window"),
  onStatus(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("desktop:status", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:status", wrapped);
    };
  },
});
