// @ts-check
import { defineConfig } from "astro/config";

import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
    output: "server",
    adapter: vercel({
        webAnalytics: {
            enabled: true,
        },
        maxDuration: 8,
    }),
    vite: {
        ssr: {
            noExternal: ["@stackframe/js", "echo-wc"],
        },
        optimizeDeps: {
            include: ["@stackframe/js", "echo-wc"],
        },
    },
});
