import RefreshRuntime from "react-refresh/runtime";

declare global {
  interface Window {
    $RefreshReg$: any;
    $RefreshSig$: any;
  }
}

var prevRefreshReg = window.$RefreshReg$;
var prevRefreshSig = window.$RefreshSig$;

window.$RefreshReg$ = (type, id) => {
  const fullId = id;
  RefreshRuntime.register(type, fullId);
};
window.$RefreshReg$ = prevRefreshReg;
window.$RefreshSig$ = prevRefreshSig;
window.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform;
window.$RefreshRuntime$ = RefreshRuntime;

window.$RefreshRuntime$.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {};
window.$RefreshSig$ = () => (type) => type;
