import { StackServerApp } from "@stackframe/js";
import type { APIContext } from "astro";

export function stackFrom(ctx: APIContext) {
    return new StackServerApp({
        tokenStore: ctx.request,

        projectId: import.meta.env.PUBLIC_STACK_PROJECT_ID,
        publishableClientKey: import.meta.env
            .PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
        secretServerKey: import.meta.env.STACK_SECRET_SERVER_KEY,
    });
}
