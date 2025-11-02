import { createSignal, createMemo, onMount, onCleanup, Show, For } from "solid-js";
import type { Room, Presentation } from "../../lib/db";
import { createShared, PRESENTATION, useSharedSlides } from "./primitives/createShared";
import { SlideView } from "./SlideView";
import { SlideRenderer } from "./SlideRenderer";
import { SlideButton } from "./SlideButton";
import { createQuery } from "./primitives/createQuery";
import type { SlideFormat } from "../../lib/slides";
import { getDefaultPresentationStyle } from "../../lib/presentation-styles";

export function PresentationViewer(props: { room: Room; presentation: Presentation }) {
    const [slideIndex, setSlideIndex] = createQuery("slide", "1");
    const [presentation] = createShared<Presentation>(PRESENTATION, props.presentation);
    const slides = useSharedSlides();
    const defaultStyle = getDefaultPresentationStyle();
    
    // P2P connection state
    const [connected, setConnected] = createSignal(false);
    const [peerCount, setPeerCount] = createSignal(0);
    const [isPresenter, setIsPresenter] = createSignal(false);
    
    let peerId: string;
    let dataChannels: Map<string, RTCDataChannel> = new Map();
    let peerConnections: Map<string, RTCPeerConnection> = new Map();
    let channelToPeerId: Map<RTCDataChannel, string> = new Map();
    let signalingInterval: number | null = null;

    // Determine if user is presenter (owner)
    onMount(async () => {
        peerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Check if current user is the owner
        let ownerId: string | undefined;
        try {
            const userResponse = await fetch('/api/user');
            if (userResponse.ok) {
                const user = await userResponse.json();
                if (user?.id && user.id === props.room.ownerId) {
                    ownerId = user.id;
                    setIsPresenter(true);
                }
            }
        } catch (e) {
            // Not logged in - can't be presenter
        }
        
        // Load current slide from room if it exists
        if (props.room.currentSlideIndex) {
            const savedIndex = props.room.currentSlideIndex;
            setSlideIndex(savedIndex);
        }
        
        // Register this peer
        await fetch('/api/signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomCode: props.room.code,
                peerId,
                action: 'register',
                ownerId: ownerId || undefined,
                roomOwnerId: props.room.ownerId,
            }),
        });
        
        // Start signaling
        startSignaling();
        
        return () => {
            if (signalingInterval !== null) {
                clearInterval(signalingInterval);
            }
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
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open' || channel.readyState === 'connecting') {
                channel.close();
            }
        });
        dataChannels.clear();
        channelToPeerId.clear();
        peerConnections.forEach(pc => pc.close());
        peerConnections.clear();
    }

    async function startSignaling() {
        const pollInterval = 2000; // Poll every 2 seconds
        signalingInterval = setInterval(async () => {
            try {
                // Get list of peers
                const peersResponse = await fetch(`/api/signal?roomCode=${props.room.code}&listPeers=true`);
                if (peersResponse.ok) {
                    const data = await peersResponse.json();
                    const remotePeers = (data.peers || []).filter((p: string) => p !== peerId);
                    
                    // Connect to new peers
                    for (const remotePeerId of remotePeers) {
                        if (!peerConnections.has(remotePeerId)) {
                            await connectToPeer(remotePeerId);
                        }
                    }
                }
                
                // Get signals
                const signalsResponse = await fetch(`/api/signal?roomCode=${props.room.code}&peerId=${encodeURIComponent(peerId)}`);
                if (signalsResponse.ok) {
                    const data = await signalsResponse.json();
                    const signals = data.signals || [];
                    if (signals.length > 0) {
                        for (const signal of signals) {
                            await handleSignal(signal);
                        }
                    }
                }
            } catch (error) {
                console.error('Signaling error:', error);
            }
        }, pollInterval) as unknown as number;
    }

    async function handleSignal(signal: any) {
        try {
            if (signal.from === peerId) return;

            const pc = peerConnections.get(signal.from) || createPeerConnection(signal.from);
            peerConnections.set(signal.from, pc);

            if (signal.type === 'offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                
                await fetch('/api/signal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomCode: props.room.code,
                        signal: {
                            type: 'answer',
                            from: peerId,
                            to: signal.from,
                            data: answer,
                        },
                    }),
                });
            } else if (signal.type === 'answer') {
                await pc.setRemoteDescription(new RTCSessionDescription(signal.data));
            } else if (signal.type === 'ice-candidate') {
                await pc.addIceCandidate(new RTCIceCandidate(signal.data));
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

        const dataChannel = pc.createDataChannel('presentation', { ordered: true });
        channelToPeerId.set(dataChannel, remotePeerId);
        setupDataChannel(dataChannel, remotePeerId);

        return pc;
    }

    function setupDataChannel(channel: RTCDataChannel, remotePeerId?: string) {
        channel.onopen = () => {
            updateConnectionStatus();
            
            // If we're the presenter and a new channel opens, send current slide immediately
            if (isPresenter()) {
                const current = parseInt(slideIndex(), 10);
                if (current > 0) {
                    channel.send(JSON.stringify({
                        type: 'slide-change',
                        slideIndex: current.toString(),
                    }));
                }
            }
        };

        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'slide-change') {
                    // Audience receives updates from presenter
                    // Presenter can also receive if they reconnect or join from another device
                    const newIndex = typeof message.slideIndex === 'string' ? parseInt(message.slideIndex, 10) : message.slideIndex;
                    if (!isNaN(newIndex)) {
                        setSlideIndex(newIndex);
                    }
                } else if (message.type === 'poll-vote') {
                    // Handle poll votes (can be implemented later for vote tracking)
                    console.log('Poll vote received:', message);
                }
            } catch (e) {
                console.error('Error parsing message:', e);
            }
        };

        channel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        channel.onclose = () => {
            updateConnectionStatus();
        };

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

        const shouldOffer = peerId < remotePeerId;
        const pc = createPeerConnection(remotePeerId);
        peerConnections.set(remotePeerId, pc);

        if (shouldOffer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await sendSignal({
                type: 'offer',
                from: peerId,
                to: remotePeerId,
                data: offer,
            });
        }
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

    async function broadcastSlideChange(newIndex: number) {
        if (!isPresenter()) return;
        
        // Save to room database
        try {
            await fetch(`/api/room/${props.room.code}/slide`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slideIndex: newIndex }),
            });
        } catch (error) {
            console.error('Failed to save slide to room:', error);
        }
        
        // Broadcast to all connected peers
        const message = {
            type: 'slide-change',
            slideIndex: newIndex.toString(),
        };
        
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(message));
            }
        });
    }

    async function handleSlideNavigation(direction: 'prev' | 'next') {
        if (!isPresenter()) return; // Only presenter can navigate
        
        const current = parseInt(slideIndex(), 10);
        const slidesArr = slides();
        if (!slidesArr) return;
        
        let newIndex = current;
        if (direction === 'next' && current < slidesArr.length) {
            newIndex = current + 1;
        } else if (direction === 'prev' && current > 1) {
            newIndex = current - 1;
        }
        
        if (newIndex !== current) {
            // Update local state first for immediate feedback
            setSlideIndex(newIndex);
            // Then broadcast and save to room
            await broadcastSlideChange(newIndex);
        }
    }

    function handleButtonClick(buttonId: string, pollId: string) {
        // Send vote to all peers
        const message = {
            type: 'poll-vote',
            pollId,
            buttonId,
            peerId,
        };
        
        dataChannels.forEach(channel => {
            if (channel.readyState === 'open') {
                channel.send(JSON.stringify(message));
            }
        });
        
        // TODO: Track votes and update poll displays
    }

    // Get presentation-level style
    const presentationStyle = () => {
        const pres = presentation();
        if (!pres?.style) return null;
        if (typeof pres.style === 'object' && pres.style !== null) {
            return pres.style as { backgroundColor?: string; textColor?: string };
        }
        return null;
    };

    // Get current slide - memoized to ensure reactivity
    const currentSlideData = createMemo(() => {
        const index = parseInt(slideIndex(), 10);
        const s = slides();
        const idx = index - 1;
        return s && idx >= 0 && idx < s.length ? s[idx] : undefined;
    });

    return (
        <div class="flex h-screen w-full flex-col overflow-hidden bg-bg">
            {/* Header with controls and connection status */}
            <div class="flex items-center justify-between border-b border-border-sidebar bg-bg-sidebar px-6 py-4">
                <div class="flex items-center gap-4">
                    <h1 class="text-xl font-semibold text-white">{presentation()?.name}</h1>
                    <div class="flex items-center gap-2">
                        <div class={`h-2 w-2 rounded-full ${connected() ? 'bg-green-500' : 'bg-gray-500'}`}></div>
                        <span class="text-sm text-gray-400">
                            {connected() ? `${peerCount()} connected` : 'Connecting...'}
                        </span>
                    </div>
                </div>
                
                <Show when={isPresenter()}>
                    <div class="flex items-center gap-2">
                        <button
                            onClick={() => handleSlideNavigation('prev')}
                            disabled={parseInt(slideIndex(), 10) <= 1}
                            class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 font-medium transition-colors cursor-pointer"
                        >
                            ← Previous
                        </button>
                        <span class="text-sm text-gray-400 px-2">
                            {slideIndex()} / {slides()?.length || 0}
                        </span>
                        <button
                            onClick={() => handleSlideNavigation('next')}
                            disabled={parseInt(slideIndex(), 10) >= (slides()?.length || 0)}
                            class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 font-medium transition-colors cursor-pointer"
                        >
                            Next →
                        </button>
                    </div>
                </Show>
                
                <Show when={!isPresenter()}>
                    <div class="text-sm text-gray-400">
                        Slide {slideIndex()} of {slides()?.length || 0}
                    </div>
                </Show>
            </div>

            {/* Main slide area */}
            <div class="flex flex-1 items-center justify-center overflow-auto bg-bg p-8">
                <Show
                    when={currentSlideData()}
                    keyed={(slide) => slide.title + slideIndex()}
                    fallback={
                        <div
                            class="relative overflow-hidden rounded-lg shadow-2xl"
                            style={{
                                width: `${960 * 0.7}px`,
                                height: `${540 * 0.7}px`,
                                "background-color": presentationStyle()?.backgroundColor ?? defaultStyle.backgroundColor,
                            }}
                        />
                    }
                >
                    {(slide) => (
                        <SlideRenderer
                            slide={slide}
                            scale={0.7}
                            className="shadow-2xl"
                            presentationStyle={presentationStyle()}
                            onButtonClick={handleButtonClick}
                        />
                    )}
                </Show>
            </div>

            {/* Share link for audience */}
            <Show when={isPresenter()}>
                <div class="border-t border-border-sidebar bg-bg-sidebar px-6 py-4">
                    <div class="flex items-center gap-4">
                        <span class="text-sm text-gray-400">Share this link to let others join:</span>
                        <input
                            type="text"
                            readOnly
                            value={typeof window !== 'undefined' ? `${window.location.origin}/join?code=${encodeURIComponent(props.room.code)}` : ''}
                            class="flex-1 rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text"
                            onClick={(e) => e.currentTarget.select()}
                        />
                        <button
                            onClick={() => {
                                if (typeof window !== 'undefined') {
                                    navigator.clipboard.writeText(`${window.location.origin}/join?code=${encodeURIComponent(props.room.code)}`);
                                }
                            }}
                            class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
                        >
                            Copy
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
}

