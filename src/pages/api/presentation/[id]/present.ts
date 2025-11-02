import type { APIRoute } from "astro";
import { createRoom } from "../../../../lib/db";
import { getPresentationById } from "../../../../lib/db";
import { localsUser } from "../../../../lib/auth";
import { redirectTo404 } from "../../../../lib/util";

// Create a presentation room and redirect to the presentation viewer
export const POST: APIRoute = async ({ params, locals }) => {
    const [user, resp] = localsUser(locals);
    if (resp) {
        return resp;
    }

    const { id } = params;
    if (!id) {
        return redirectTo404("Presentation ID is required.");
    }

    const idAsInt = parseInt(id, 10);
    if (isNaN(idAsInt)) {
        return redirectTo404("Invalid presentation ID.");
    }

    // Verify user owns the presentation
    const [presentation, presErr] = await getPresentationById(user.id, id);
    if (presErr || !presentation) {
        return redirectTo404("Presentation not found or you don't have permission.");
    }

    // Create a room for this presentation
    const [room, roomErr] = await createRoom(user.id, idAsInt);
    if (roomErr) {
        return roomErr;
    }

    // Return the room code so client can navigate
    return new Response(JSON.stringify({ roomCode: room.code }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

