import { defineMiddleware } from "astro/middleware";
import { stackFrom } from "./lib/stack-server";

export const onRequest = defineMiddleware(async (context, next) => {
    const timeBefore = Date.now();
    // const user = await stackFrom(context.request).getUser();
    const user = null;

    console.log("It took:", Date.now() - timeBefore, "ms to get the user");

    if (user) {
        context.locals.user = user;
        context.locals.publicPageUser = user;
    }

    return next();
});
