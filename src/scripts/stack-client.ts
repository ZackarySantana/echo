import { StackClientApp } from "@stackframe/js";

export const stackClientApp = new StackClientApp({
    tokenStore: "cookie",

    projectId: import.meta.env.PUBLIC_STACK_PROJECT_ID,
    publishableClientKey: import.meta.env.PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
    urls: {
        oauthCallback: window.location.origin + "/oauth/callback",
    },
});
