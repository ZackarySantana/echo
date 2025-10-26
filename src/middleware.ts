import { defineMiddleware } from "astro/middleware";
import { stackFrom } from "./lib/stack-server";

const noAuth = ["/", "/login", "/sign-up", "/oauth/callback"];

export const onRequest = defineMiddleware(async (context, next) => {
    const timeBefore = Date.now();
    const user = await stackFrom(context.request).getUser();

    console.log("It took:", Date.now() - timeBefore, "ms to get the user");

    if (user) {
        context.locals.user = user;
    }

    if (noAuth.includes(context.url.pathname)) {
        console.log("Skip requiring auth for", context.url.pathname);
        return next();
    }

    if (!user) {
        return context.redirect(
            "/login?next=" + encodeURIComponent(context.url.pathname),
            302,
        );
    }

    return next();
});
