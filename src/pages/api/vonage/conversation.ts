import type { APIRoute } from "astro";
import { getRoomByCode, updateRoom } from "../../../lib/db";
import {
    getOrCreateUser,
    createConversation,
    addMemberToConversation,
    getConversationMembers,
    removeMemberFromConversation,
} from "../../../lib/vonage";
import { optionalLocalsUser } from "../../../lib/auth";
import { redirectTo404 } from "../../../lib/util";

// Get or create a conversation for a room
export const POST: APIRoute = async ({ request, locals }) => {
    const body = await request.json();
    const { roomCode } = body as { roomCode: string };

    if (!roomCode) {
        return new Response(JSON.stringify({ error: "Missing roomCode" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Get room
    const [room, roomErr] = await getRoomByCode(roomCode);
    if (roomErr || !room) {
        return redirectTo404("Room not found.");
    }

    // Get user info
    const user = optionalLocalsUser(locals);
    const userId =
        user?.id ||
        `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userName = user?.primaryEmail || userId;

    try {
        // Ensure user exists in Vonage and get the Vonage user name
        const vonageUserName = await getOrCreateUser(userId, userName);

        let conversationId = room.conversationId;

        // Create conversation if it doesn't exist
        if (!conversationId) {
            const presentationName = room.presentationId
                ? `Presentation ${roomCode}`
                : `Room ${roomCode}`;
            const conversation = await createConversation(
                roomCode,
                presentationName,
            );
            conversationId = conversation;

            // Save conversation ID to room
            await updateRoom(roomCode, { conversationId });
        }

        // Add user to conversation (use Vonage user name, not app user ID)
        await addMemberToConversation(conversationId, vonageUserName, "joined");

        return new Response(
            JSON.stringify({
                conversationId,
                userId,
            }),
            {
                headers: { "Content-Type": "application/json" },
            },
        );
    } catch (error: any) {
        console.error("Error managing conversation:", error);
        return new Response(
            JSON.stringify({
                error: "Failed to manage conversation",
                details: error.message,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
};

// Get conversation members (attendees)
export const GET: APIRoute = async ({ url, locals }) => {
    const roomCode = url.searchParams.get("roomCode");

    if (!roomCode) {
        return new Response(JSON.stringify({ error: "Missing roomCode" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Get room
    const [room, roomErr] = await getRoomByCode(roomCode);
    if (roomErr || !room) {
        return redirectTo404("Room not found.");
    }

    if (!room.conversationId) {
        return new Response(JSON.stringify({ members: [] }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const members = await getConversationMembers(room.conversationId);
        return new Response(
            JSON.stringify({
                members: members._embedded?.members || [],
            }),
            {
                headers: { "Content-Type": "application/json" },
            },
        );
    } catch (error: any) {
        console.error("Error getting members:", error);
        return new Response(
            JSON.stringify({
                error: "Failed to get members",
                details: error.message,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
};

// Leave conversation
export const DELETE: APIRoute = async ({ request, locals }) => {
    const body = await request.json();
    const { roomCode } = body as { roomCode: string };

    if (!roomCode) {
        return new Response(JSON.stringify({ error: "Missing roomCode" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    // Get room
    const [room, roomErr] = await getRoomByCode(roomCode);
    if (roomErr || !room) {
        return redirectTo404("Room not found.");
    }

    if (!room.conversationId) {
        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    // Get user info
    const user = optionalLocalsUser(locals);
    const userId =
        user?.id ||
        `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userName = user?.primaryEmail || userId;

    try {
        // Get Vonage user name for removing member
        const vonageUserName = await getOrCreateUser(userId, userName);
        await removeMemberFromConversation(room.conversationId, vonageUserName);

        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Error removing member:", error);
        return new Response(
            JSON.stringify({
                error: "Failed to remove member",
                details: error.message,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
};
