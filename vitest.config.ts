import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // kuromoji の辞書ロード（初回約1秒）を考慮した余裕のあるタイムアウト
        testTimeout: 20000,
        hookTimeout: 30000,
    },
});
