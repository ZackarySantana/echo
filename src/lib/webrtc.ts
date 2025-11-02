// WebRTC P2P connection manager
// Database-first approach for serverless compatibility - always fresh state
import { getRoomByCode, updateRoom } from "./db";

export type SignalMessage = {
    type: 'offer' | 'answer' | 'ice-candidate';
    from: string;
    to?: string;
    data: any;
};

type SignalingState = {
    peers: string[];
    signals: Record<string, SignalMessage[]>; // peerId -> signals[]
    peerToOwner: Record<string, string>; // peerId -> ownerId
};

// Always read from database (fresh state across serverless instances)
async function getSignalingState(roomCode: string): Promise<SignalingState> {
    const [room, err] = await getRoomByCode(roomCode);
    if (err || !room) {
        return { peers: [], signals: {}, peerToOwner: {} };
    }
    
    const signaling = room.signaling;
    if (signaling && typeof signaling === 'object') {
        const dbState = signaling as any;
        return {
            peers: Array.isArray(dbState.peers) ? dbState.peers : [],
            signals: dbState.signals || {},
            peerToOwner: dbState.peerToOwner || {},
        };
    }
    
    return { peers: [], signals: {}, peerToOwner: {} };
}

// Write immediately to database for visibility across instances
async function saveSignalingState(roomCode: string, state: SignalingState): Promise<void> {
    await updateRoom(roomCode, { 
        signaling: {
            peers: state.peers,
            signals: state.signals,
            peerToOwner: state.peerToOwner,
        }
    }).catch(err => {
        console.error(`Failed to save signaling state for ${roomCode}:`, err);
    });
}

export async function registerPeer(roomCode: string, peerId: string, ownerId?: string): Promise<void> {
    const state = await getSignalingState(roomCode);
    
    let changed = false;
    if (!state.peers.includes(peerId)) {
        state.peers.push(peerId);
        changed = true;
    }
    
    // Track owner if provided
    if (ownerId && state.peerToOwner[peerId] !== ownerId) {
        state.peerToOwner[peerId] = ownerId;
        changed = true;
    }
    
    // Write immediately so peer is visible across instances
    if (changed) {
        await saveSignalingState(roomCode, state);
    }
}

export async function getRoomOwner(roomCode: string): Promise<string | undefined> {
    const state = await getSignalingState(roomCode);
    // Get owner from first peer that has an ownerId
    const peerIds = Object.keys(state.peerToOwner);
    if (peerIds.length > 0) {
        return state.peerToOwner[peerIds[0]];
    }
    return undefined;
}

export async function isPeerOwner(peerId: string, roomCode: string, roomOwnerId: string): Promise<boolean> {
    const state = await getSignalingState(roomCode);
    const peerOwnerId = state.peerToOwner[peerId];
    return peerOwnerId === roomOwnerId;
}

export async function unregisterPeer(roomCode: string, peerId: string, roomOwnerId: string): Promise<{ isOwner: boolean; ownerId?: string }> {
    const state = await getSignalingState(roomCode);
    const peerOwnerId = state.peerToOwner[peerId];
    const isOwner = peerOwnerId === roomOwnerId;
    
    // Remove peer from registry
    const hadPeer = state.peers.includes(peerId);
    state.peers = state.peers.filter(p => p !== peerId);
    
    // Clean up peer mapping
    const hadOwner = peerId in state.peerToOwner;
    delete state.peerToOwner[peerId];
    
    // Clean up signals for this peer
    const hadSignals = peerId in state.signals;
    delete state.signals[peerId];
    
    // Write immediately if changed
    if (hadPeer || hadOwner || hadSignals) {
        await saveSignalingState(roomCode, state);
    }
    
    return { isOwner: isOwner || false, ownerId: roomOwnerId };
}

export async function getPeers(roomCode: string): Promise<string[]> {
    const state = await getSignalingState(roomCode);
    // Return a copy to prevent external mutations
    return [...state.peers];
}

export async function storeSignal(roomCode: string, signal: SignalMessage): Promise<void> {
    if (!signal.to) return;
    
    const state = await getSignalingState(roomCode);
    
    if (!state.signals[signal.to]) {
        state.signals[signal.to] = [];
    }
    
    state.signals[signal.to].push(signal);
    
    // Limit signals per peer to prevent unbounded growth
    if (state.signals[signal.to].length > 50) {
        state.signals[signal.to] = state.signals[signal.to].slice(-50);
    }
    
    // Write immediately for fast delivery
    await saveSignalingState(roomCode, state).catch(err => {
        // Don't block on errors, but log them
        console.error('Failed to save signal:', err);
    });
    
    // Clean up old signals after 30 seconds (async, don't wait)
    setTimeout(async () => {
        const currentState = await getSignalingState(roomCode);
        if (currentState.signals[signal.to!]) {
            currentState.signals[signal.to!] = currentState.signals[signal.to!].filter(s => s !== signal);
            if (currentState.signals[signal.to!].length === 0) {
                delete currentState.signals[signal.to!];
            }
            await saveSignalingState(roomCode, currentState).catch(() => {});
        }
    }, 30000);
}

export async function getSignals(roomCode: string, peerId: string): Promise<SignalMessage[]> {
    const state = await getSignalingState(roomCode);
    const signals = state.signals[peerId] || [];
    
    // Clear signals after retrieving (they've been delivered)
    if (signals.length > 0) {
        delete state.signals[peerId];
        // Write immediately to clear delivered signals
        await saveSignalingState(roomCode, state).catch(() => {});
    }
    
    return signals;
}

