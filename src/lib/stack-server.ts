// We have to import it this way to avoid errors when the middleware
// calls this file when deployed to Vercel.
import pkg from "@stackframe/js";
const { StackServerApp } = pkg;

export function stackFrom(request: Request) {
    return new StackServerApp({
        tokenStore: request,

        projectId: import.meta.env.PUBLIC_STACK_PROJECT_ID,
        publishableClientKey: import.meta.env
            .PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
        secretServerKey: import.meta.env.STACK_SECRET_SERVER_KEY,
    });
}
