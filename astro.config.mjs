// @ts-check
import { defineConfig } from "astro/config";

import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";

import solidJs from "@astrojs/solid-js";

// https://astro.build/config
export default defineConfig({
    output: "server",

    adapter: vercel({
        webAnalytics: {
            enabled: true,
        },
    }),

    vite: {
        ssr: {
            noExternal: ["@stackframe/js", "echo-wc"],
        },
        optimizeDeps: {
            include: ["@stackframe/js", "echo-wc"],
        },
        plugins: [tailwindcss()],
    },

    integrations: [solidJs({ devtools: true })],
});
