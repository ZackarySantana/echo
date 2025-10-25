/// <reference types="astro/client" />

import type {
    CurrentServerUser,
    CurrentInternalServerUser,
} from "@stackframe/js";

declare global {
    namespace App {
        interface Locals {
            user: CurrentServerUser | CurrentInternalServerUser;
        }
    }
}
