import * as fs from "node:fs";
import * as path from "node:path";

import * as chokidar from "chokidar";
import * as esbuild from "esbuild";
import express from "express";
import expressWebSocket from "express-ws";

/**
 * @param {esbuild.BuildResult} build
 */
function writeIndexHtml(build) {
  let [entry] = Object.entries(build.metafile.outputs).find(
    ([_, output]) => output.inputs["app/entry.client.tsx"]
  );
  let [hmrEntry] = Object.entries(build.metafile.outputs).find(
    ([_, output]) => output.inputs["hmr-entrypoint.ts"]
  );

  entry = JSON.stringify("/" + entry.replace(/^public\//, ""));
  hmrEntry = JSON.stringify("/" + hmrEntry.replace(/^public\//, ""));

  fs.writeFileSync(
    "public/index.html",
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ESBuild HMR</title>
  </head>
  <body>
    <h1>ESBuild HMR</h1>
    <div id="app"></div>
    <script type="module" src=${hmrEntry}></script>
    <script type="module">
      import * as entry from ${entry};

      entry.run();
    </script>
  </body>
</html>
`
  );
}

const esbuildContext = await esbuild.context({
  assetNames: "[name]-[hash]",
  bundle: true,
  chunkNames: "[name]-[hash]",
  entryNames: "[name]-[hash]",
  entryPoints: {
    bundle: "app/entry.client.tsx",
    hmr: "hmr-entrypoint.ts",
    react: "react",
    "react-dom": "react-dom",
    "react-refresh/runtime": "react-refresh/runtime",
  },
  format: "esm",
  logLevel: "warning",
  jsx: "automatic",
  metafile: true,
  outdir: "public/build",
  platform: "browser",
  splitting: true,
  target: "es2019",
  supported: {
    "import-meta": true,
  },
  plugins: [
    {
      name: "hmr-runtime",
      setup(build) {
        build.onResolve({ filter: /^hmr:runtime$/ }, (args) => {
          return {
            path: "hmr:runtime",
            namespace: "hmr-runtime",
          };
        });

        build.onLoad({ filter: /.*/, namespace: "hmr-runtime" }, (args) => {
          const contents = fs.readFileSync("hmr-runtime.ts", "utf8");

          return {
            contents,
            loader: "ts",
          };
        });
      },
    },
    {
      name: "hmr",
      async setup(build) {
        const babel = await import("@babel/core");
        const reactRefresh = await import("react-refresh/babel");

        const IS_FAST_REFRESH_ENABLED = /\$RefreshReg\$\(/;

        const appDir = path.join(process.cwd(), "app");

        build.onLoad({ filter: /.*/, namespace: "file" }, (args) => {
          if (
            !args.path.match(/\.[tj]sx?$/) ||
            !fs.existsSync(args.path) ||
            !args.path.startsWith(appDir)
          ) {
            return undefined;
          }

          const hmrId = JSON.stringify(path.relative(process.cwd(), args.path));
          const hmrPrefix = fs
            .readFileSync("hmr-prefix.ts", "utf8")
            .replace(
              `import * as __hmr__ from "./hmr-runtime";`,
              `import * as __hmr__ from "hmr:runtime";`
            )
            .replace(/\$id\$/g, hmrId);
          const sourceCode = fs.readFileSync(args.path, "utf8");

          const sourceCodeWithHMR = hmrPrefix + sourceCode;

          const jsWithHMR = esbuild.transformSync(sourceCodeWithHMR, {
            loader: args.path.endsWith("x") ? "tsx" : "ts",
            format: args.pluginData?.format || "esm",
          }).code;
          let resultCode = jsWithHMR;

          const jsWithReactRefresh = babel.transformSync(jsWithHMR, {
            filename: args.path,
            ast: false,
            compact: false,
            sourceMaps: build.initialOptions.sourcemap ? "inline" : false,
            configFile: false,
            babelrc: false,
            plugins: [[reactRefresh.default, { skipEnvCheck: true }]],
          }).code;

          if (IS_FAST_REFRESH_ENABLED.test(jsWithReactRefresh)) {
            resultCode =
              `
              if (!window.$RefreshReg$ || !window.$RefreshSig$ || !window.$RefreshRuntime$) {
                console.warn('@remix-run/react-refresh: HTML setup script not run. React Fast Refresh only works when Remix serves your HTML routes. You may want to remove this plugin.');
              } else {
                var prevRefreshReg = window.$RefreshReg$;
                var prevRefreshSig = window.$RefreshSig$;
                window.$RefreshReg$ = (type, id) => {
                  window.$RefreshRuntime$.register(type, ${JSON.stringify(
                    hmrId
                  )} + id);
                }
                window.$RefreshSig$ = window.$RefreshRuntime$.createSignatureFunctionForTransform;
              }
            ` +
              jsWithReactRefresh +
              `
              window.$RefreshReg$ = prevRefreshReg;
              window.$RefreshSig$ = prevRefreshSig;
              import.meta.hot.accept(({ module }) => {
                router.routes[id].links = module.links
                console.log({module, runtime: window.$RefreshRuntime$})
                window.$RefreshRuntime$.performReactRefresh();
              });
            `;
          }

          return {
            contents: resultCode,
            loader: args.path.endsWith("x") ? "tsx" : "ts",
            resolveDir: path.dirname(args.path),
          };
        });
      },
    },
  ],
});

let lastBuildResult = await esbuildContext.rebuild();
writeIndexHtml(lastBuildResult);

const expressApp = express();
const ws = expressWebSocket(expressApp);
const app = ws.app;

app.use(express.static("public"));
app.ws("/__hmr__", () => {});

const server = await new Promise((resolve) => {
  const server = expressApp.listen(3000, "localhost", () => {
    console.log("Listening on http://localhost:3000");
    resolve(server);
  });
});

const watcher = chokidar
  .watch("app", {
    ignoreInitial: true,
  })
  .on("all", async (eventName, path) => {
    console.log(eventName, path);

    const newBuildResult = await esbuildContext.rebuild();
    writeIndexHtml(newBuildResult);

    let message = JSON.stringify({
      type: "reload",
    });

    if (lastBuildResult && !lastBuildResult.errors.length) {
      const lastInputsSet = new Set(
        Object.keys(lastBuildResult.metafile.inputs)
      );
      const lastInputToOutput = Object.entries(
        lastBuildResult.metafile.outputs
      ).reduce((acc, [outputFile, output]) => {
        Object.keys(output.inputs).forEach((input) => {
          if (lastInputsSet.has(input)) {
            acc[input] = outputFile;
          }
        });
        return acc;
      }, {});

      const newInputsSet = new Set(Object.keys(newBuildResult.metafile.inputs));
      const newInputToOutput = Object.entries(
        newBuildResult.metafile.outputs
      ).reduce((acc, [outputFile, output]) => {
        Object.keys(output.inputs).forEach((input) => {
          if (newInputsSet.has(input)) {
            acc[input] = outputFile;
          }
        });
        return acc;
      }, {});

      const updates = Object.keys(newBuildResult.metafile.inputs).reduce(
        (acc, input) => {
          if (lastInputToOutput[input] !== newInputToOutput[input]) {
            acc.push({
              type: "update",
              id: input,
              url: "/" + newInputToOutput[input].replace(/^public\//, ""),
            });
          }

          return acc;
        },
        []
      );

      message = JSON.stringify({ type: "hmr", updates });
    }

    lastBuildResult = newBuildResult;

    const clients = ws.getWss().clients;
    if (clients.size > 0) {
      console.log(
        "Send reload to",
        clients.size,
        "client" + (clients.size > 1 ? "s" : "")
      );
      clients.forEach((socket) => {
        socket.send(message);
      });
    }
  });

await new Promise((resolve) => process.once("SIGINT", resolve));

try {
  await watcher.close();
} catch {}
try {
  await esbuildContext.dispose();
} catch {}
try {
  await new Promise((resolve, reject) => {
    server.close((reason) => {
      if (reason) reject(reason);
      else resolve();
    });
  });
} catch {}
