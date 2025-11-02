import { createSignal, onMount, onCleanup, Show } from "solid-js";
import type { Room } from "../../lib/db";

export function RoomView(props: { room: Room }) {
    const [text, setText] = createSignal("");
    const [connected, setConnected] = createSignal(false);
    const [peerCount, setPeerCount] = createSignal(0);
    let peerId: string;
    let dataChannels: Map<string, RTCDataChannel> = new Map();
    let peerConnections: Map<string, RTCPeerConnection> = new Map();
    let channelToPeerId: Map<RTCDataChannel, string> = new Map();
    let signalingInterval: number | null = null;

    // Generate a unique peer ID
    onMount(async () => {
        peerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Check if current user is the owner
        let ownerId: string | undefined;
        try {
            // Try to get user info from API
            const userResponse = await fetch('/api/user');
            if (userResponse.ok) {
                const user = await userResponse.json();
                if (user?.id && user.id === props.room.ownerId) {
                    ownerId = user.id;
                }
            } else {
                // If not logged in, check if room owner is anonymous
                // For anonymous owners, we'll track by being the first peer (handled server-side)
                // But we can also pass the room's ownerId for the server to match
                if (props.room.ownerId === "anonymous") {
                    // For anonymous rooms, we'll let the server determine owner on first registration
                    ownerId = undefined;
                }
            }
        } catch (e) {
            // Not logged in or error - that's fine
            // If room owner is anonymous, we might be able to claim ownership if first
            if (props.room.ownerId === "anonymous") {
                ownerId = undefined;
            }
        }
        
        // Register this peer (with ownerId if this is the owner, or pass room ownerId for server to check)
        await fetch('/api/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomCode: props.room.code,
                peerId,
                action: 'register',
                ownerId: ownerId || (props.room.ownerId === "anonymous" ? props.room.ownerId : undefined),
                roomOwnerId: props.room.ownerId, // Always pass room's ownerId for verification
            }),
        });
        
        // Start polling for other peers and signals
        startSignaling();
        
        return () => {
            if (signalingInterval !== null) {
                clearInterval(signalingInterval);
            }
            // Unregister peer
            fetch('/api/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomCode: props.room.code,
                    peerId,
                    action: 'unregister',
                }),
            }).catch(console.error);
            cleanup();
        };
    });

    onCleanup(() => {
        cleanup();
    });

    function cleanup() {
        // Close all data channels
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open' || channel.readyState === 'connecting') {
                channel.close();
            }
        });
        dataChannels.clear();
        channelToPeerId.clear();

        // Close all peer connections
        peerConnections.forEach(pc => {
            pc.close();
        });
        peerConnections.clear();
    }

    async function startSignaling() {
        // Poll for signals every 2 seconds
        signalingInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/signal?roomCode=${props.room.code}&peerId=${encodeURIComponent(peerId)}`);
                const { signals } = await response.json();
                
                for (const signal of signals || []) {
                    await handleSignal(signal);
                }

                // Check for new peers and establish connections
                await discoverPeers();
            } catch (error) {
                console.error("Signaling error:", error);
            }
        }, 2000);

        // Initial peer discovery
        await discoverPeers();
    }

    async function discoverPeers() {
        try {
            // Get list of peers in the room
            const response = await fetch(`/api/signal?roomCode=${props.room.code}&listPeers=true`);
            const { peers } = await response.json();
            
            // Connect to peers we haven't connected to yet
            for (const peer of peers || []) {
                if (peer !== peerId && !peerConnections.has(peer)) {
                    await connectToPeer(peer);
                }
            }
        } catch (error) {
            console.error('Error discovering peers:', error);
        }
    }

    async function handleSignal(signal: any) {
        if (signal.from === peerId) return; // Ignore our own signals

        let pc = peerConnections.get(signal.from);
        
        if (!pc) {
            // Create connection if it doesn't exist (e.g., we received an offer before discovering the peer)
            pc = createPeerConnection(signal.from);
            peerConnections.set(signal.from, pc);
        }

        try {
            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                await sendSignal({
                    type: 'answer',
                    from: peerId,
                    to: signal.from,
                    data: answer,
                });
            } else if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'ice-candidate') {
                if (pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(signal.data));
                } else {
                    // Store ICE candidate if remote description isn't set yet
                    // (will be added when remote description is set)
                    console.log('ICE candidate received before remote description');
                }
            }
        } catch (error) {
            console.error('Error handling signal:', error);
        }
    }

    function createPeerConnection(remotePeerId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
            ],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: 'ice-candidate',
                    from: peerId,
                    to: remotePeerId,
                    data: event.candidate,
                });
            }
        };

        pc.ondatachannel = (event) => {
            const channel = event.channel;
            // Track which peer this channel belongs to
            channelToPeerId.set(channel, remotePeerId);
            setupDataChannel(channel, remotePeerId);
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                updateConnectionStatus();
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                peerConnections.delete(remotePeerId);
                const channel = dataChannels.get(remotePeerId);
                if (channel) {
                    channelToPeerId.delete(channel);
                }
                dataChannels.delete(remotePeerId);
                updateConnectionStatus();
            }
        };

        // Create data channel for sending data
        const dataChannel = pc.createDataChannel('sharedText', { ordered: true });
        channelToPeerId.set(dataChannel, remotePeerId);
        setupDataChannel(dataChannel, remotePeerId);

        return pc;
    }

    function setupDataChannel(channel: RTCDataChannel, remotePeerId?: string) {
        channel.onopen = () => {
            console.log('Data channel opened');
            if (channel.label !== 'sharedText') return;
            // Send current text when channel opens
            if (text()) {
                channel.send(JSON.stringify({ type: 'text', content: text() }));
            }
            updateConnectionStatus();
        };

        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'text') {
                    // Only update if it's different to avoid loops
                    const currentText = text();
                    if (message.content !== currentText) {
                        setText(message.content);
                    }
                }
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        channel.onclose = () => {
            console.log('Data channel closed');
            updateConnectionStatus();
        };

        // Store the channel
        const peerIdForChannel = remotePeerId || channelToPeerId.get(channel);
        if (peerIdForChannel) {
            dataChannels.set(peerIdForChannel, channel);
        }
    }
    
    function updateConnectionStatus() {
        let connectedCount = 0;
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') {
                connectedCount++;
            }
        });
        setPeerCount(connectedCount);
        setConnected(connectedCount > 0);
    }

    async function connectToPeer(remotePeerId: string) {
        if (peerConnections.has(remotePeerId)) return;

        // Determine who should create the offer (smaller peer ID is the offerer)
        const shouldOffer = peerId < remotePeerId;

        const pc = createPeerConnection(remotePeerId);
        peerConnections.set(remotePeerId, pc);

        if (shouldOffer) {
            // Create offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            await sendSignal({
                type: 'offer',
                from: peerId,
                to: remotePeerId,
                data: offer,
            });
        }
        // If we're not the offerer, we'll wait for the offer signal
    }

    async function sendSignal(signal: any) {
        try {
            await fetch('/api/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomCode: props.room.code,
                    signal,
                }),
            });
        } catch (error) {
            console.error('Error sending signal:', error);
        }
    }

    function broadcastText(newText: string) {
        setText(newText);
        // Broadcast to all connected peers
        dataChannels.forEach((channel) => {
            if (channel.readyState === 'open') {
                try {
                    channel.send(JSON.stringify({ type: 'text', content: newText }));
                } catch (error) {
                    console.error('Error sending message:', error);
                }
            }
        });
    }

    return (
        <div class="flex h-full w-full flex-col p-8">
            <div class="mb-4 flex items-center justify-between">
                <h1 class="text-2xl font-bold">Room: {props.room.code}</h1>
                <div class="flex items-center gap-4">
                    <Show when={connected()}>
                        <span class="flex items-center gap-2">
                            <span class="h-2 w-2 rounded-full bg-green-500"></span>
                            <span class="text-sm text-gray-400">
                                Connected ({peerCount()} peer{peerCount() !== 1 ? 's' : ''})
                            </span>
                        </span>
                    </Show>
                    <Show when={!connected()}>
                        <span class="flex items-center gap-2">
                            <span class="h-2 w-2 rounded-full bg-gray-500"></span>
                            <span class="text-sm text-gray-400">Connecting...</span>
                        </span>
                    </Show>
                </div>
            </div>
            
            <div class="flex-1">
                <label class="mb-2 block text-sm font-medium">Shared Text Area</label>
                <textarea
                    value={text()}
                    onInput={(e) => broadcastText(e.currentTarget.value)}
                    placeholder="Start typing... Changes will be shared with other room members"
                    class="h-full w-full rounded-md border border-gray-700 bg-gray-900 p-4 font-mono text-sm text-white focus:border-blue-500 focus:outline-none"
                />
            </div>
        </div>
    );
}

