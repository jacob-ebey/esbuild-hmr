type ModuleNamespace = Record<string, any> & {
  [Symbol.toStringTag]: "Module";
};

interface ImportMetaHot {
  accept(cb: (mod: ModuleNamespace) => void): void;
}

interface ImportMeta {
  hot: ImportMetaHot | undefined;
}
