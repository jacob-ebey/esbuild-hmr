import * as __hmr__ from "./hmr-runtime";

if (import.meta) {
  import.meta.hot = __hmr__.createHotContext(
    //@ts-expect-error
    $id$
  );
}
