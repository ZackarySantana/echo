import type { APIRoute } from "astro";
import { updateRoom, getRoomByCode } from "../../../../lib/db";
import { redirectTo404 } from "../../../../lib/util";
import { z } from "zod";

const UpdateVotesSchema = z.object({
    votes: z.record(z.string(), z.record(z.string(), z.number())),
    peerVotes: z.record(z.string(), z.record(z.string(), z.string())),
});

export const PUT: APIRoute = async ({ params, request }) => {
    const { code } = params;
    if (!code) {
        return redirectTo404("Room code is required.");
    }

    // Verify room exists
    const [room, roomErr] = await getRoomByCode(code);
    if (roomErr || !room) {
        return redirectTo404("Room not found.");
    }

    const body = await request.json();
    const parsed = UpdateVotesSchema.safeParse(body);

    if (!parsed.success) {
        return new Response(
            JSON.stringify({ error: "Invalid request body", details: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const [updatedRoom, err] = await updateRoom(code, { 
        votes: {
            votes: parsed.data.votes,
            peerVotes: parsed.data.peerVotes,
        }
    });

    if (err) {
        return err;
    }

    return new Response(JSON.stringify(updatedRoom), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

export const GET: APIRoute = async ({ params }) => {
    const { code } = params;
    if (!code) {
        return redirectTo404("Room code is required.");
    }

    const [room, err] = await getRoomByCode(code);
    if (err) {
        return err;
    }

    const votes = room.votes && typeof room.votes === 'object' 
        ? (room.votes as any)
        : { votes: {}, peerVotes: {} };

    return new Response(JSON.stringify(votes), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

