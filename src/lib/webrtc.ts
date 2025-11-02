// WebRTC P2P connection manager
// Database-first approach - all state is in database, no server memory
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

// Atomic operation: Add peer if not exists (prevents race conditions)
async function atomicAddPeer(roomCode: string, peerId: string, ownerId?: string): Promise<void> {
    // Simple approach: Read, check, write (with retry on conflict)
    // For serverless, this is usually fast enough that conflicts are rare
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const state = await getSignalingState(roomCode);
        
        // Check if already registered
        if (state.peers.includes(peerId)) {
            // Already registered, just update owner if needed
            if (ownerId && state.peerToOwner[peerId] !== ownerId) {
                state.peerToOwner[peerId] = ownerId;
                await saveSignalingState(roomCode, state);
            }
            return;
        }
        
        // Add peer
        state.peers.push(peerId);
        if (ownerId) {
            state.peerToOwner[peerId] = ownerId;
        }
        
        try {
            await saveSignalingState(roomCode, state);
            return; // Success
        } catch (err) {
            if (attempt < maxRetries - 1) {
                // Retry after a short delay
                await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
                continue;
            }
            throw err;
        }
    }
}

// Atomic operation: Add signal (appends without overwriting)
async function atomicAddSignal(roomCode: string, signal: SignalMessage): Promise<void> {
    if (!signal.to) return;
    
    const maxRetries = 2;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const state = await getSignalingState(roomCode);
        
        if (!state.signals[signal.to]) {
            state.signals[signal.to] = [];
        }
        
        // Add signal (don't duplicate)
        const isDuplicate = state.signals[signal.to].some(s => 
            s.from === signal.from && 
            s.type === signal.type && 
            JSON.stringify(s.data) === JSON.stringify(signal.data)
        );
        
        if (!isDuplicate) {
            state.signals[signal.to].push(signal);
            
            // Limit signals per peer
            if (state.signals[signal.to].length > 50) {
                state.signals[signal.to] = state.signals[signal.to].slice(-50);
            }
            
            try {
                await saveSignalingState(roomCode, state);
                return; // Success
            } catch (err) {
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 50));
                    continue;
                }
                throw err;
            }
        } else {
            return; // Already exists, no need to write
        }
    }
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
    // Use atomic operation to prevent race conditions
    await atomicAddPeer(roomCode, peerId, ownerId);
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
    
    // Use atomic operation to prevent race conditions
    await atomicAddSignal(roomCode, signal).catch(err => {
        console.error('Failed to store signal:', err);
    });
    
    // Clean up old signals after 30 seconds (async, don't wait)
    setTimeout(async () => {
        const currentState = await getSignalingState(roomCode);
        if (currentState.signals[signal.to!]) {
            const filtered = currentState.signals[signal.to!].filter(s => {
                return s !== signal && 
                    !(s.from === signal.from && s.type === signal.type && JSON.stringify(s.data) === JSON.stringify(signal.data));
            });
            if (filtered.length !== currentState.signals[signal.to!].length) {
                currentState.signals[signal.to!] = filtered;
                if (filtered.length === 0) {
                    delete currentState.signals[signal.to!];
                }
                await saveSignalingState(roomCode, currentState).catch(() => {});
            }
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

