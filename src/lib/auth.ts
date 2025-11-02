import type { TokenPartialUser } from "../token_partial_user";
import { redirectTo404, type Or } from "./util";

export function localsUser(locals: App.Locals): Or<TokenPartialUser, Response> {
    if (locals.user && locals.user.id) {
        return [locals.user, undefined];
    }
    return [undefined, redirectTo404()];
}
