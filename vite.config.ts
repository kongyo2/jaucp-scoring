import { defineConfig, type Plugin } from "vite";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

const DICT_SOURCE = path.resolve(__dirname, "node_modules/kuromoji/dict");

/**
 * kuromoji の形態素解析辞書 (*.dat.gz) を配信・同梱するプラグイン。
 * - dev: /dict/* を node_modules から直接ストリーム配信
 * - build: dist/dict へコピーして Tauri バンドルに含める
 *
 * 辞書ファイルは自前 gzip なので Content-Encoding は付けない
 * （kuromoji が zlibjs でインフレートする）。
 */
function kuromojiDictPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "kuromoji-dict",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use("/dict", (req, res, next) => {
        const name = path.basename((req.url ?? "").split("?")[0]);
        if (!/^[\w.-]+\.dat\.gz$/.test(name)) {
          next();
          return;
        }
        const filePath = path.join(DICT_SOURCE, name);
        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end("dictionary file not found");
          return;
        }
        res.setHeader("Content-Type", "application/octet-stream");
        createReadStream(filePath).pipe(res);
      });
    },
    async closeBundle() {
      const dest = path.resolve(__dirname, outDir, "dict");
      await mkdir(dest, { recursive: true });
      for (const file of await readdir(DICT_SOURCE)) {
        if (file.endsWith(".dat.gz")) {
          await copyFile(path.join(DICT_SOURCE, file), path.join(dest, file));
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [kuromojiDictPlugin()],

  resolve: {
    alias: {
      // kuromoji の BrowserDictionaryLoader が使う path.join の最小シム
      path: path.resolve(__dirname, "src/lib/path-shim.ts"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
