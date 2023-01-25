if (!window.__hmr__) {
  window.__hmr__ = {
    contexts: {},
  };

  const socketURL = new URL(
    "/__hmr__",
    window.location.href.replace(/^http(s)?:/, "ws$1:")
  );
  const socket = (window.__hmr__.socket = new WebSocket(socketURL.href));
  socket.addEventListener("message", async (event) => {
    const payload = JSON.parse(event.data);

    switch (payload?.type) {
      case "reload":
        window.location.reload();
        break;
      case "hmr":
        if (!payload.updates?.length) return;

        for (const update of payload.updates) {
          if (window.__hmr__.contexts[update.id]) {
            if (
              window.__hmr__.contexts[update.id].emit(await import(update.url))
            ) {
              console.log("[HMR] Updated accepted by", update.id);
              return;
            }
          }
        }
        console.log("[HMR] Updated rejected, reloading...");
        window.location.reload();
        break;
    }
  });
}

export function createHotContext(id: string): ImportMetaHot {
  let callback: undefined | ((mod: ModuleNamespace) => void);
  let disposed = false;

  const hot = {
    accept: (cb) => {
      if (disposed) {
        throw new Error("import.meta.hot.accept() called after dispose()");
      }
      if (callback) {
        throw new Error("import.meta.hot.accept() already called");
      }
      callback = cb;
    },
    dispose: () => {
      disposed = true;
      callback = undefined;
    },
    emit(self: ModuleNamespace) {
      if (callback) {
        callback(self);
        return true;
      }
      return false;
    },
  };

  window.__hmr__.contexts[id] = hot;

  return hot;
}

declare global {
  interface Window {
    __hmr__: any;
  }
}
