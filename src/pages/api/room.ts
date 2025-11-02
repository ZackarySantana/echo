import type { APIRoute } from "astro";
import { optionalLocalsUser } from "../../lib/auth";
import { createRoom, getRoomByCode } from "../../lib/db";
import { redirectTo404 } from "../../lib/util";

export const GET: APIRoute = async ({ url, locals }) => {
    const code = url.searchParams.get("code");

    if (code) {
        // Get room by code - no auth required
        const [room, err] = await getRoomByCode(code);
        if (err) {
            return err;
        }
        return new Response(JSON.stringify(room), {
            headers: { "Content-Type": "application/json" },
        });
    }

    // Create a new room - use optional user ID if available
    const user = optionalLocalsUser(locals);
    const [room, err] = await createRoom(user?.id);
    if (err) {
        return err;
    }

    return new Response(JSON.stringify(room), {
        headers: { "Content-Type": "application/json" },
    });
};

