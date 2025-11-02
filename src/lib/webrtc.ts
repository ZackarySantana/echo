// WebRTC P2P connection manager
// Hybrid approach: in-memory for speed, database for persistence
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
    lastSync: number; // Timestamp of last DB sync
};

// In-memory store for fast access (primary)
const inMemoryStore = new Map<string, SignalingState>();

// Track which rooms need syncing
const roomsToSync = new Set<string>();
let syncInterval: number | null = null;

// Sync all rooms to database periodically (every 5 seconds)
function startSyncTimer() {
    if (syncInterval) return;
    
    syncInterval = setInterval(async () => {
        const rooms = Array.from(roomsToSync);
        roomsToSync.clear();
        
        for (const roomCode of rooms) {
            const state = inMemoryStore.get(roomCode);
            if (state) {
                try {
                    await updateRoom(roomCode, { signaling: {
                        peers: state.peers,
                        signals: state.signals,
                        peerToOwner: state.peerToOwner,
                    } });
                    state.lastSync = Date.now();
                } catch (err) {
                    console.error(`Failed to sync room ${roomCode}:`, err);
                    roomsToSync.add(roomCode); // Retry next time
                }
            }
        }
    }, 5000) as unknown as number;
}

// Initialize sync timer
startSyncTimer();

async function getSignalingState(roomCode: string): Promise<SignalingState> {
    // Check in-memory first (fast)
    const cached = inMemoryStore.get(roomCode);
    if (cached) {
        return cached;
    }
    
    // Load from database if not in memory
    const [room, err] = await getRoomByCode(roomCode);
    if (err || !room) {
        const emptyState: SignalingState = { peers: [], signals: {}, peerToOwner: {}, lastSync: Date.now() };
        inMemoryStore.set(roomCode, emptyState);
        return emptyState;
    }
    
    const signaling = room.signaling;
    let state: SignalingState;
    
    if (signaling && typeof signaling === 'object') {
        const dbState = signaling as any;
        state = {
            peers: dbState.peers || [],
            signals: dbState.signals || {},
            peerToOwner: dbState.peerToOwner || {},
            lastSync: Date.now(),
        };
    } else {
        state = { peers: [], signals: {}, peerToOwner: {}, lastSync: Date.now() };
    }
    
    // Cache in memory
    inMemoryStore.set(roomCode, state);
    return state;
}

function markForSync(roomCode: string) {
    roomsToSync.add(roomCode);
}

export async function registerPeer(roomCode: string, peerId: string, ownerId?: string): Promise<void> {
    const state = await getSignalingState(roomCode);
    
    if (!state.peers.includes(peerId)) {
        state.peers.push(peerId);
        markForSync(roomCode);
    }
    
    // Track owner if provided
    if (ownerId && state.peerToOwner[peerId] !== ownerId) {
        state.peerToOwner[peerId] = ownerId;
        markForSync(roomCode);
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
    
    // Mark for sync if anything changed
    if (hadPeer || hadOwner || hadSignals) {
        markForSync(roomCode);
    }
    
    // If no peers left, clear from memory
    if (state.peers.length === 0) {
        inMemoryStore.delete(roomCode);
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
    
    // Mark for sync (but don't block)
    markForSync(roomCode);
    
    // Clean up old signals after 30 seconds (async, don't wait)
    setTimeout(() => {
        const currentState = inMemoryStore.get(roomCode);
        if (currentState && currentState.signals[signal.to!]) {
            currentState.signals[signal.to!] = currentState.signals[signal.to!].filter(s => s !== signal);
            if (currentState.signals[signal.to!].length === 0) {
                delete currentState.signals[signal.to!];
            }
            markForSync(roomCode);
        }
    }, 30000);
}

export async function getSignals(roomCode: string, peerId: string): Promise<SignalMessage[]> {
    const state = await getSignalingState(roomCode);
    const signals = state.signals[peerId] || [];
    
    // Clear signals after retrieving (they've been delivered)
    if (signals.length > 0) {
        delete state.signals[peerId];
        markForSync(roomCode);
    }
    
    return signals;
}

