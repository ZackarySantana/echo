// WebRTC P2P connection manager
export type SignalMessage = {
    type: 'offer' | 'answer' | 'ice-candidate';
    from: string;
    to?: string;
    data: any;
};

// Simple in-memory signal store (minimal DB involvement as requested)
// In production, you might want to use Redis or a proper signaling server
const signalStore = new Map<string, SignalMessage[]>();
const peerRegistry = new Map<string, Set<string>>(); // roomCode -> Set of peerIds
const roomOwners = new Map<string, string>(); // roomCode -> ownerId (user ID)
const peerToOwner = new Map<string, string>(); // peerId -> ownerId (maps peer to the owner they represent)

export function registerPeer(roomCode: string, peerId: string, ownerId?: string) {
    if (!peerRegistry.has(roomCode)) {
        peerRegistry.set(roomCode, new Set());
    }
    peerRegistry.get(roomCode)!.add(peerId);
    
    // Track owner if provided
    if (ownerId) {
        roomOwners.set(roomCode, ownerId);
        peerToOwner.set(peerId, ownerId);
    }
    
    // Auto-cleanup after 5 minutes of inactivity
    setTimeout(() => {
        unregisterPeer(roomCode, peerId);
    }, 5 * 60 * 1000);
}

export function getRoomOwner(roomCode: string): string | undefined {
    return roomOwners.get(roomCode);
}

export function isPeerOwner(peerId: string, roomCode: string): boolean {
    const ownerId = roomOwners.get(roomCode);
    if (!ownerId) return false;
    return peerToOwner.get(peerId) === ownerId;
}

export function unregisterPeer(roomCode: string, peerId: string): { isOwner: boolean; ownerId?: string } {
    const peers = peerRegistry.get(roomCode);
    const ownerId = peerToOwner.get(peerId);
    const roomOwnerId = roomOwners.get(roomCode);
    const isOwner = ownerId && roomOwnerId && ownerId === roomOwnerId;
    
    if (peers) {
        peers.delete(peerId);
        if (peers.size === 0) {
            peerRegistry.delete(roomCode);
            roomOwners.delete(roomCode);
        }
    }
    
    // Clean up peer mapping
    peerToOwner.delete(peerId);
    
    // Clean up signals for this peer
    const signalKey = `${roomCode}:${peerId}`;
    signalStore.delete(signalKey);
    
    return { isOwner: isOwner || false, ownerId: roomOwnerId };
}

export function getPeers(roomCode: string): string[] {
    const peers = peerRegistry.get(roomCode);
    return peers ? Array.from(peers) : [];
}

export function storeSignal(roomCode: string, signal: SignalMessage) {
    const targetKey = signal.to ? `${roomCode}:${signal.to}` : null;
    
    if (targetKey) {
        // Store signal for specific recipient
        if (!signalStore.has(targetKey)) {
            signalStore.set(targetKey, []);
        }
        signalStore.get(targetKey)!.push(signal);
    }
    
    // Clean up old signals (older than 30 seconds)
    setTimeout(() => {
        if (targetKey) {
            const signals = signalStore.get(targetKey);
            if (signals) {
                const filtered = signals.filter(s => s !== signal);
                if (filtered.length === 0) {
                    signalStore.delete(targetKey);
                } else {
                    signalStore.set(targetKey, filtered);
                }
            }
        }
    }, 30000);
}

export function getSignals(roomCode: string, peerId: string): SignalMessage[] {
    const key = `${roomCode}:${peerId}`;
    const signals = signalStore.get(key) || [];
    // Return and clear
    signalStore.delete(key);
    return signals;
}

