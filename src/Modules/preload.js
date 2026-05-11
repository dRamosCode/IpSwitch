const { app, contextBridge, ipcRenderer } = require("electron");

const createChannel = (channel) => {
  let listeners = [];
  ipcRenderer.on(channel, (evt, ...args) => {
    listeners.forEach((cb) => cb(...args));
  });
  return {
    send: (data) => ipcRenderer.send(channel, data),
    on: (cb) => {
      listeners.push(cb);
      return () => {
        listeners = listeners.filter((l) => l !== cb);
      };
    },
    once: (cb) => {
      const remove = ipcRenderer.once(channel, (evt, ...args) => cb(...args));
      return remove;
    },
  };
};

window.addEventListener("DOMContentLoaded", () => {
  contextBridge.exposeInMainWorld("electron", {
    close: () => ipcRenderer.send("close"),
    maximize: () => ipcRenderer.send("maximize"),
    minimize: () => ipcRenderer.send("minimize"),
    saveJSON: (data) => ipcRenderer.send("saveJSON", data),
    overwriteJSON: (data) => ipcRenderer.send("overwriteJSON", data),
    requestData: () => ipcRenderer.send("requestData"),
    receiveData: (data) => {
      ipcRenderer.once("updateData", data);
    },
    requestAdapters: () => ipcRenderer.send("requestAdapters"),
    receiveAdapters: (adapters) => {
      ipcRenderer.once("sendAdapters", adapters);
    },
    requestAdapterInfo: (adapter) => ipcRenderer.send("requestAdapterInfo", adapter),
    receiveAdapterInfo: (adapterInfo) => {
      ipcRenderer.once("sendAdapterInfo", adapterInfo);
    },
    changeNetwork: (network) => ipcRenderer.send("changeNetwork", network),
    checkNetwork: (network) => {
      ipcRenderer.on("sendNetwork", network);
      return () => ipcRenderer.removeListener("sendNetwork", network);
    },
    requestRights: () => ipcRenderer.send("requestRights"),
    receiveRights: (rights) => {
      ipcRenderer.once("sendRights", rights);
    },
  });
  ipcRenderer.setMaxListeners(100);
});