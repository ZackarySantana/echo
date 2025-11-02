/// <reference types="astro/client" />

import type { TokenPartialUser } from "./token_partial_user";

declare global {
    namespace App {
        interface Locals {
            user: TokenPartialUser;
            publicPageUser: TokenPartialUser | null;
        }
    }
}
