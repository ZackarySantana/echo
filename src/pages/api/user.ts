import type { APIRoute } from "astro";
import { optionalLocalsUser } from "../../lib/auth";

export const GET: APIRoute = async ({ locals }) => {
    const user = optionalLocalsUser(locals);
    
    if (!user) {
        return new Response(JSON.stringify(null), {
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ id: user.id }), {
        headers: { "Content-Type": "application/json" },
    });
};


