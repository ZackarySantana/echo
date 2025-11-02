import type { APIRoute } from "astro";
import { updateRoom } from "../../../../lib/db";
import { redirectTo404 } from "../../../../lib/util";
import { z } from "zod";

const UpdateSlideSchema = z.object({
    slideIndex: z.number().int().positive(),
});

// Update the current slide index for a presentation room
export const PUT: APIRoute = async ({ params, request }) => {
    const { code } = params;
    if (!code) {
        return redirectTo404("Room code is required.");
    }

    const body = await request.json();
    const parsed = UpdateSlideSchema.safeParse(body);
    
    if (!parsed.success) {
        return new Response(
            JSON.stringify({ error: "Invalid request body", details: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const [updated, err] = await updateRoom(code, { currentSlideIndex: parsed.data.slideIndex });
    
    if (err) {
        return err;
    }

    return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

