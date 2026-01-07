import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Components from "unplugin-vue-components/vite";
import { BootstrapVueNextResolver } from "unplugin-vue-components/resolvers";
import viteCompression from "vite-plugin-compression";
import "vue";

const viteCompressionFilter = /\.(js|mjs|json|css|html|svg)$/i;

// https://vitejs.dev/config/
export default defineConfig({
    server: {
        port: 5000,
    },
    define: {
        "FRONTEND_VERSION": JSON.stringify(process.env.npm_package_version),
    },
    root: "./frontend",
    build: {
        outDir: "../frontend-dist",
        rollupOptions: {
            output: {
                manualChunks: {
                    "vue": [ "vue", "vue-router" ],
                    "bootstrap-vue-next": [ "bootstrap-vue-next", "bootstrap" ],
                    "codemirror": [
                        "codemirror",
                        "vue-codemirror",
                        "@codemirror/lang-javascript",
                        "@codemirror/lang-yaml",
                        "@codemirror/theme-one-dark",
                        "@codemirror/view",
                        "@codemirror/state",
                        "@codemirror/language",
                    ],
                    "xterm": [ "@xterm/xterm", "@xterm/addon-fit", "xterm-addon-web-links" ],
                }
            },
        },
    },
    plugins: [
        vue(),
        Components({
            resolvers: [ BootstrapVueNextResolver() ],
        }),
        viteCompression({
            algorithm: "gzip",
            filter: viteCompressionFilter,
        }),
        viteCompression({
            algorithm: "brotliCompress",
            filter: viteCompressionFilter,
        }),
    ],
});
