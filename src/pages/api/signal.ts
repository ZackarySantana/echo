import type { APIRoute } from "astro";
import { storeSignal, getSignals, registerPeer, getPeers, unregisterPeer } from "../../lib/webrtc";
import type { SignalMessage } from "../../lib/webrtc";
import { hideRoom } from "../../lib/db";

// POST to send a signal - no auth required for P2P signaling
export const POST: APIRoute = async ({ request }) => {

    const body = await request.json();
    const { roomCode, signal, peerId, action, ownerId, roomOwnerId } = body as { 
        roomCode: string; 
        signal?: SignalMessage;
        peerId?: string;
        action?: 'register' | 'unregister';
        ownerId?: string;
        roomOwnerId?: string; // The ownerId from the room object
    };

    if (!roomCode) {
        return new Response(JSON.stringify({ error: "Missing roomCode" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (action === 'register' && peerId) {
        // Determine if this peer is the owner
        let actualOwnerId: string | undefined;
        if (ownerId && roomOwnerId && ownerId === roomOwnerId) {
            // User is logged in and matches room owner
            actualOwnerId = ownerId;
        } else if (roomOwnerId === "anonymous") {
            // For anonymous owners, check if this is the first peer
            const peers = getPeers(roomCode);
            if (peers.length === 0) {
                // First peer becomes the owner
                actualOwnerId = "anonymous";
            }
        }
        
        registerPeer(roomCode, peerId, actualOwnerId);
        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    if (action === 'unregister' && peerId) {
        const { isOwner } = unregisterPeer(roomCode, peerId);
        
        // If owner left, hide the room
        if (isOwner) {
            await hideRoom(roomCode).catch((err) => {
                console.error("Failed to hide room:", err);
            });
        }
        
        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    if (signal) {
        storeSignal(roomCode, signal);
        return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
    });
};

// GET to retrieve signals for a peer or list peers - no auth required for P2P signaling
export const GET: APIRoute = async ({ url }) => {

    const roomCode = url.searchParams.get("roomCode");
    const peerId = url.searchParams.get("peerId");
    const listPeers = url.searchParams.get("listPeers") === "true";

    if (!roomCode) {
        return new Response(JSON.stringify({ error: "Missing roomCode" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    if (listPeers) {
        const peers = getPeers(roomCode);
        return new Response(JSON.stringify({ peers }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    if (peerId) {
        const signals = getSignals(roomCode, peerId);
        return new Response(JSON.stringify({ signals }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ error: "Missing peerId or listPeers" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
    });
};

