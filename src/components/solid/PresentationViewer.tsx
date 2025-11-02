import {
    createSignal,
    createMemo,
    createEffect,
    onMount,
    onCleanup,
    Show,
    For,
} from "solid-js";
import type { Room, Presentation } from "../../lib/db";
import {
    createShared,
    PRESENTATION,
    useSharedSlides,
} from "./primitives/createShared";
import { SlideView } from "./SlideView";
import { SlideRenderer } from "./SlideRenderer";
import { SlideButton } from "./SlideButton";
import { createQuery } from "./primitives/createQuery";
import type { SlideFormat } from "../../lib/slides";
import { getDefaultPresentationStyle } from "../../lib/presentation-styles";

export function PresentationViewer(props: {
    room: Room;
    presentation: Presentation;
}) {
    const [slideIndex, setSlideIndex] = createQuery("slide", "1");
    const [presentation] = createShared<Presentation>(
        PRESENTATION,
        props.presentation,
    );
    const slides = useSharedSlides();
    const defaultStyle = getDefaultPresentationStyle();

    // P2P connection state
    const [connected, setConnected] = createSignal(false);
    const [peerCount, setPeerCount] = createSignal(0);
    const [isPresenter, setIsPresenter] = createSignal(false);

    // Copy button animation state
    const [copied, setCopied] = createSignal(false);

    // Vote tracking state
    // Structure: voteCounts[pollId][buttonId] = count
    const [voteCounts, setVoteCounts] = createSignal<
        Record<string, Record<string, number>>
    >({});
    // Track which button each peer voted for: peerVotes[pollId][peerId] = buttonId
    const [peerVotes, setPeerVotes] = createSignal<
        Record<string, Record<string, string>>
    >({});

    let peerId: string;
    let dataChannels: Map<string, RTCDataChannel> = new Map();
    let peerConnections: Map<string, RTCPeerConnection> = new Map();
    let channelToPeerId: Map<RTCDataChannel, string> = new Map();
    let signalingInterval: number | null = null;
    let keepaliveIntervals: Map<string, number> = new Map();
    let reconnectAttempts: Map<string, number> = new Map();
    let reconnectTimeouts: Map<string, number> = new Map();

    // Determine if user is presenter (owner)
    onMount(async () => {
        peerId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Check if current user is the owner
        let ownerId: string | undefined;
        try {
            const userResponse = await fetch("/api/user");
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

        // Load vote state from database
        await loadVoteState();

        // Register this peer
        await fetch("/api/signal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                roomCode: props.room.code,
                peerId,
                action: "register",
                ownerId: ownerId || undefined,
                roomOwnerId: props.room.ownerId,
            }),
        });

        // Immediately discover peers (don't wait for polling)
        try {
            const peersResponse = await fetch(
                `/api/signal?roomCode=${props.room.code}&listPeers=true`,
            );
            if (peersResponse.ok) {
                const data = await peersResponse.json();
                const remotePeers = (data.peers || []).filter(
                    (p: string) => p !== peerId,
                );
                for (const remotePeerId of remotePeers) {
                    if (!peerConnections.has(remotePeerId)) {
                        await connectToPeer(remotePeerId);
                    }
                }
            }
        } catch (error) {
            console.error("Initial peer discovery error:", error);
        }

        // Start signaling
        startSignaling();

        return () => {
            if (signalingInterval !== null) {
                clearInterval(signalingInterval);
            }
            fetch("/api/signal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomCode: props.room.code,
                    peerId,
                    action: "unregister",
                }),
            }).catch(console.error);
            cleanup();
        };
    });

    onCleanup(() => {
        cleanup();
    });

    function cleanup() {
        // Save vote state before cleanup
        if (saveVotesTimeout !== null) {
            clearTimeout(saveVotesTimeout);
            saveVoteState();
        }

        // Clear all keepalive intervals
        keepaliveIntervals.forEach((interval) => clearInterval(interval));
        keepaliveIntervals.clear();

        // Clear all reconnect timeouts
        reconnectTimeouts.forEach((timeout) => clearTimeout(timeout));
        reconnectTimeouts.clear();

        reconnectAttempts.clear();

        dataChannels.forEach((channel) => {
            if (
                channel.readyState === "open" ||
                channel.readyState === "connecting"
            ) {
                channel.close();
            }
        });
        dataChannels.clear();
        channelToPeerId.clear();
        peerConnections.forEach((pc) => pc.close());
        peerConnections.clear();
    }

    async function startSignaling() {
        const pollInterval = 500; // Poll every 500ms for faster discovery
        signalingInterval = setInterval(async () => {
            try {
                // Get list of peers
                const peersResponse = await fetch(
                    `/api/signal?roomCode=${props.room.code}&listPeers=true`,
                );
                if (peersResponse.ok) {
                    const data = await peersResponse.json();
                    const remotePeers = (data.peers || []).filter(
                        (p: string) => p !== peerId,
                    );

                    // Connect to new peers
                    for (const remotePeerId of remotePeers) {
                        if (!peerConnections.has(remotePeerId)) {
                            await connectToPeer(remotePeerId);
                        }
                    }
                }

                // Get signals
                const signalsResponse = await fetch(
                    `/api/signal?roomCode=${props.room.code}&peerId=${encodeURIComponent(peerId)}`,
                );
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
                console.error("Signaling error:", error);
            }
        }, pollInterval) as unknown as number;
    }

    async function handleSignal(signal: any) {
        try {
            if (signal.from === peerId) return;

            let pc = peerConnections.get(signal.from);

            // Create connection if it doesn't exist
            if (!pc) {
                pc = createPeerConnection(signal.from);
                peerConnections.set(signal.from, pc);
            }

            if (signal.type === "offer") {
                // If we already have a connection, restart ICE
                if (pc.signalingState !== "stable") {
                    console.log(
                        `Connection state not stable for ${signal.from}, creating new connection`,
                    );
                    cleanupPeerConnection(signal.from);
                    pc = createPeerConnection(signal.from);
                    peerConnections.set(signal.from, pc);
                }

                await pc.setRemoteDescription(
                    new RTCSessionDescription(signal.data),
                );
                const answer = await pc.createAnswer({ iceRestart: false });
                await pc.setLocalDescription(answer);

                await fetch("/api/signal", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        roomCode: props.room.code,
                        signal: {
                            type: "answer",
                            from: peerId,
                            to: signal.from,
                            data: answer,
                        },
                    }),
                });
            } else if (signal.type === "answer") {
                // Only set remote description if in the right state
                if (pc.signalingState === "have-local-offer") {
                    await pc.setRemoteDescription(
                        new RTCSessionDescription(signal.data),
                    );
                }
            } else if (signal.type === "ice-candidate") {
                // Only add candidate if connection is in a valid state
                if (pc.remoteDescription && pc.signalingState !== "closed") {
                    try {
                        await pc.addIceCandidate(
                            new RTCIceCandidate(signal.data),
                        );
                    } catch (e) {
                        // Candidate might be outdated, ignore error
                        console.warn(
                            "Failed to add ICE candidate (likely outdated):",
                            e,
                        );
                    }
                }
            }
        } catch (error) {
            console.error("Error handling signal:", error);
            // If signal handling fails, try to reconnect
            if (signal.from) {
                const existingPc = peerConnections.get(signal.from);
                if (
                    existingPc &&
                    (existingPc.connectionState === "failed" ||
                        existingPc.connectionState === "closed")
                ) {
                    cleanupPeerConnection(signal.from);
                    attemptReconnect(signal.from);
                }
            }
        }
    }

    function createPeerConnection(remotePeerId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                // Public TURN servers for better NAT traversal
                {
                    urls: "turn:openrelay.metered.ca:80",
                    username: "openrelayproject",
                    credential: "openrelayproject",
                },
                {
                    urls: "turn:openrelay.metered.ca:443",
                    username: "openrelayproject",
                    credential: "openrelayproject",
                },
                {
                    urls: "turn:openrelay.metered.ca:443?transport=tcp",
                    username: "openrelayproject",
                    credential: "openrelayproject",
                },
            ],
            iceCandidatePoolSize: 10,
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendSignal({
                    type: "ice-candidate",
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
            const state = pc.connectionState;
            console.log(
                `Connection state changed for ${remotePeerId}: ${state}`,
            );

            if (state === "connected") {
                // Clear any reconnect attempts on successful connection
                reconnectAttempts.delete(remotePeerId);
                const timeout = reconnectTimeouts.get(remotePeerId);
                if (timeout !== undefined) {
                    clearTimeout(timeout);
                    reconnectTimeouts.delete(remotePeerId);
                }
                // Start keepalive
                startKeepalive(remotePeerId);
                updateConnectionStatus();
            } else if (state === "disconnected") {
                // Try to reconnect if disconnected (might be temporary)
                attemptReconnect(remotePeerId);
                stopKeepalive(remotePeerId);
                updateConnectionStatus();
            } else if (state === "failed" || state === "closed") {
                // Clean up and try to reconnect for failed connections
                cleanupPeerConnection(remotePeerId);
                attemptReconnect(remotePeerId);
                updateConnectionStatus();
            } else if (state === "connecting") {
                // Clear failed state indicators
                updateConnectionStatus();
            }
        };

        const dataChannel = pc.createDataChannel("presentation", {
            ordered: true,
        });
        channelToPeerId.set(dataChannel, remotePeerId);
        setupDataChannel(dataChannel, remotePeerId);

        return pc;
    }

    function setupDataChannel(channel: RTCDataChannel, remotePeerId?: string) {
        channel.onopen = () => {
            console.log(
                `Data channel opened for ${remotePeerId || "unknown peer"}`,
            );
            updateConnectionStatus();

            // If we're the presenter and a new channel opens, send current slide immediately
            if (isPresenter()) {
                const current = parseInt(slideIndex(), 10);
                if (current > 0) {
                    channel.send(
                        JSON.stringify({
                            type: "slide-change",
                            slideIndex: current.toString(),
                        }),
                    );
                }
            }

            // Send current vote state to newly connected peer
            // Also load from database first to ensure we have the latest state
            loadVoteState().then(() => {
                const currentVotes = voteCounts();
                const currentPeerVotes = peerVotes();
                if (Object.keys(currentVotes).length > 0) {
                    channel.send(
                        JSON.stringify({
                            type: "vote-state-sync",
                            votes: currentVotes,
                            peerVotes: currentPeerVotes,
                        }),
                    );
                }
            });
        };

        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);

                // Handle keepalive pings
                if (message.type === "ping") {
                    const peerIdForChannel =
                        remotePeerId || channelToPeerId.get(channel);
                    if (peerIdForChannel) {
                        const channelToRespond =
                            dataChannels.get(peerIdForChannel);
                        if (
                            channelToRespond &&
                            channelToRespond.readyState === "open"
                        ) {
                            channelToRespond.send(
                                JSON.stringify({ type: "pong" }),
                            );
                        }
                    }
                    return;
                }

                if (message.type === "pong") {
                    // Pong received, connection is alive
                    return;
                }

                if (message.type === "slide-change") {
                    // Audience receives updates from presenter
                    // Presenter can also receive if they reconnect or join from another device
                    const newIndex =
                        typeof message.slideIndex === "string"
                            ? parseInt(message.slideIndex, 10)
                            : message.slideIndex;
                    if (!isNaN(newIndex)) {
                        setSlideIndex(newIndex);
                    }
                } else if (message.type === "poll-vote") {
                    // Handle poll vote
                    handleIncomingVote(
                        message.pollId,
                        message.buttonId,
                        message.peerId,
                    );
                } else if (message.type === "vote-state-sync") {
                    // Receive full vote state from another peer (usually presenter)
                    // Merge with existing state rather than replace to avoid losing local votes
                    if (message.votes && message.peerVotes) {
                        setVoteCounts(message.votes);
                        setPeerVotes(message.peerVotes);
                        scheduleVoteSave();
                    }
                }
            } catch (e) {
                console.error("Error parsing message:", e);
            }
        };

        channel.onerror = (error) => {
            console.error("Data channel error:", error);
            const peerIdForChannel =
                remotePeerId || channelToPeerId.get(channel);
            if (peerIdForChannel) {
                stopKeepalive(peerIdForChannel);
            }
        };

        channel.onclose = () => {
            console.log(
                `Data channel closed for ${remotePeerId || "unknown peer"}`,
            );
            const peerIdForChannel =
                remotePeerId || channelToPeerId.get(channel);
            if (peerIdForChannel) {
                stopKeepalive(peerIdForChannel);
            }
            updateConnectionStatus();
        };

        const peerIdForChannel = remotePeerId || channelToPeerId.get(channel);
        if (peerIdForChannel) {
            dataChannels.set(peerIdForChannel, channel);
        }
    }

    function startKeepalive(remotePeerId: string) {
        // Clear any existing keepalive
        stopKeepalive(remotePeerId);

        // Send ping every 10 seconds
        const interval = setInterval(() => {
            const channel = dataChannels.get(remotePeerId);
            if (channel && channel.readyState === "open") {
                try {
                    channel.send(JSON.stringify({ type: "ping" }));
                } catch (e) {
                    console.error("Error sending keepalive ping:", e);
                    stopKeepalive(remotePeerId);
                }
            } else {
                stopKeepalive(remotePeerId);
            }
        }, 10000) as unknown as number;

        keepaliveIntervals.set(remotePeerId, interval);
    }

    function stopKeepalive(remotePeerId: string) {
        const interval = keepaliveIntervals.get(remotePeerId);
        if (interval !== undefined) {
            clearInterval(interval);
            keepaliveIntervals.delete(remotePeerId);
        }
    }

    function cleanupPeerConnection(remotePeerId: string) {
        stopKeepalive(remotePeerId);
        const pc = peerConnections.get(remotePeerId);
        if (pc) {
            pc.close();
            peerConnections.delete(remotePeerId);
        }
        const channel = dataChannels.get(remotePeerId);
        if (channel) {
            channelToPeerId.delete(channel);
            dataChannels.delete(remotePeerId);
        }
    }

    function attemptReconnect(remotePeerId: string) {
        // Clear any existing reconnect timeout
        const existingTimeout = reconnectTimeouts.get(remotePeerId);
        if (existingTimeout !== undefined) {
            clearTimeout(existingTimeout);
        }

        const attempts = reconnectAttempts.get(remotePeerId) || 0;

        // Don't reconnect too many times (max 5 attempts)
        if (attempts >= 5) {
            console.log(
                `Max reconnection attempts reached for ${remotePeerId}`,
            );
            reconnectAttempts.delete(remotePeerId);
            reconnectTimeouts.delete(remotePeerId);
            return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = Math.min(1000 * Math.pow(2, attempts), 16000);
        reconnectAttempts.set(remotePeerId, attempts + 1);

        console.log(
            `Attempting to reconnect to ${remotePeerId} in ${delay}ms (attempt ${attempts + 1}/5)`,
        );

        const timeout = setTimeout(async () => {
            reconnectTimeouts.delete(remotePeerId);

            // Only reconnect if peer is still registered
            try {
                const peersResponse = await fetch(
                    `/api/signal?roomCode=${props.room.code}&listPeers=true`,
                );
                if (peersResponse.ok) {
                    const data = await peersResponse.json();
                    const remotePeers = (data.peers || []).filter(
                        (p: string) => p !== peerId,
                    );

                    if (
                        remotePeers.includes(remotePeerId) &&
                        !peerConnections.has(remotePeerId)
                    ) {
                        console.log(`Reconnecting to ${remotePeerId}`);
                        await connectToPeer(remotePeerId);
                    } else {
                        // Peer no longer exists, clean up
                        reconnectAttempts.delete(remotePeerId);
                    }
                }
            } catch (error) {
                console.error("Error during reconnection:", error);
                reconnectAttempts.delete(remotePeerId);
            }
        }, delay) as unknown as number;

        reconnectTimeouts.set(remotePeerId, timeout);
    }

    function updateConnectionStatus() {
        let connectedCount = 0;
        dataChannels.forEach((channel) => {
            if (channel.readyState === "open") {
                connectedCount++;
            }
        });
        setPeerCount(connectedCount);
        setConnected(connectedCount > 0);
    }

    async function connectToPeer(remotePeerId: string) {
        // If already connecting or connected, don't reconnect
        const existingPc = peerConnections.get(remotePeerId);
        if (existingPc) {
            const state = existingPc.connectionState;
            if (state === "connected" || state === "connecting") {
                return;
            }
            // If in a failed state, clean it up first
            cleanupPeerConnection(remotePeerId);
        }

        const shouldOffer = peerId < remotePeerId;
        const pc = createPeerConnection(remotePeerId);
        peerConnections.set(remotePeerId, pc);

        if (shouldOffer) {
            try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                await sendSignal({
                    type: "offer",
                    from: peerId,
                    to: remotePeerId,
                    data: offer,
                });
            } catch (error) {
                console.error("Error creating offer:", error);
                cleanupPeerConnection(remotePeerId);
                attemptReconnect(remotePeerId);
            }
        }
    }

    async function sendSignal(signal: any) {
        try {
            await fetch("/api/signal", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    roomCode: props.room.code,
                    signal,
                }),
            });
        } catch (error) {
            console.error("Error sending signal:", error);
        }
    }

    async function broadcastSlideChange(newIndex: number) {
        if (!isPresenter()) return;

        // Save to room database
        try {
            await fetch(`/api/room/${props.room.code}/slide`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slideIndex: newIndex }),
            });
        } catch (error) {
            console.error("Failed to save slide to room:", error);
        }

        // Broadcast to all connected peers
        const message = {
            type: "slide-change",
            slideIndex: newIndex.toString(),
        };

        dataChannels.forEach((channel) => {
            if (channel.readyState === "open") {
                channel.send(JSON.stringify(message));
            }
        });
    }

    async function handleSlideNavigation(direction: "prev" | "next") {
        if (!isPresenter()) return; // Only presenter can navigate

        const current = parseInt(slideIndex(), 10);
        const slidesArr = slides();
        if (!slidesArr) return;

        let newIndex = current;
        if (direction === "next" && current < slidesArr.length) {
            newIndex = current + 1;
        } else if (direction === "prev" && current > 1) {
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
        // Update local vote state first
        handleVote(pollId, buttonId, peerId, true);

        // Send vote to all peers
        const message = {
            type: "poll-vote",
            pollId,
            buttonId,
            peerId,
        };

        dataChannels.forEach((channel) => {
            if (channel.readyState === "open") {
                channel.send(JSON.stringify(message));
            }
        });
    }

    let saveVotesTimeout: number | null = null;

    async function loadVoteState() {
        try {
            const response = await fetch(`/api/room/${props.room.code}/votes`);
            if (response.ok) {
                const data = await response.json();
                if (data.votes && data.peerVotes) {
                    setVoteCounts(data.votes);
                    setPeerVotes(data.peerVotes);
                }
            }
        } catch (error) {
            console.error("Failed to load vote state:", error);
        }
    }

    async function saveVoteState() {
        const currentVotes = voteCounts();
        const currentPeerVotes = peerVotes();

        try {
            await fetch(`/api/room/${props.room.code}/votes`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    votes: currentVotes,
                    peerVotes: currentPeerVotes,
                }),
            });
        } catch (error) {
            console.error("Failed to save vote state:", error);
        }
    }

    function scheduleVoteSave() {
        // Debounce saves to avoid too many database calls
        if (saveVotesTimeout !== null) {
            clearTimeout(saveVotesTimeout);
        }
        saveVotesTimeout = setTimeout(() => {
            saveVoteState();
            saveVotesTimeout = null;
        }, 500) as unknown as number; // Save after 500ms of no changes
    }

    function handleVote(
        pollId: string,
        buttonId: string,
        voterPeerId: string,
        isLocalVote: boolean = false,
    ) {
        setVoteCounts((prev) => {
            const newCounts = { ...prev };
            const peerVotesState = peerVotes();

            // Check if this peer already voted for a different button in this poll
            const existingVote = peerVotesState[pollId]?.[voterPeerId];

            if (existingVote && existingVote !== buttonId) {
                // Peer changed their vote - decrement old button, increment new button
                if (!newCounts[pollId]) {
                    newCounts[pollId] = {};
                }
                if (!newCounts[pollId][existingVote]) {
                    newCounts[pollId][existingVote] = 0;
                }
                if (!newCounts[pollId][buttonId]) {
                    newCounts[pollId][buttonId] = 0;
                }

                // Decrement old vote (but don't go below 0)
                newCounts[pollId][existingVote] = Math.max(
                    0,
                    newCounts[pollId][existingVote] - 1,
                );
                // Increment new vote
                newCounts[pollId][buttonId] =
                    (newCounts[pollId][buttonId] || 0) + 1;
            } else if (!existingVote) {
                // New vote
                if (!newCounts[pollId]) {
                    newCounts[pollId] = {};
                }
                if (!newCounts[pollId][buttonId]) {
                    newCounts[pollId][buttonId] = 0;
                }
                newCounts[pollId][buttonId] =
                    (newCounts[pollId][buttonId] || 0) + 1;
            }
            // If existingVote === buttonId, peer clicked the same button again - ignore (or implement toggle if desired)

            return newCounts;
        });

        // Update peer votes tracking
        setPeerVotes((prev) => {
            const newPeerVotes = { ...prev };
            if (!newPeerVotes[pollId]) {
                newPeerVotes[pollId] = {};
            }
            newPeerVotes[pollId][voterPeerId] = buttonId;
            return newPeerVotes;
        });

        // Schedule save to database (debounced)
        scheduleVoteSave();
    }

    function handleIncomingVote(
        pollId: string,
        buttonId: string,
        voterPeerId: string,
    ) {
        // Only update if this vote is from another peer
        if (voterPeerId !== peerId) {
            handleVote(pollId, buttonId, voterPeerId, false);
        }
    }

    // Helper to get vote count for a specific button
    function getVoteCount(pollId: string, buttonId: string): number {
        const counts = voteCounts();
        return counts[pollId]?.[buttonId] || 0;
    }

    // Helper to get total votes for a poll
    function getTotalPollVotes(pollId: string): number {
        const counts = voteCounts();
        const pollCounts = counts[pollId];
        if (!pollCounts) return 0;
        return Object.values(pollCounts).reduce((sum, count) => sum + count, 0);
    }

    // Get presentation-level style
    const presentationStyle = () => {
        const pres = presentation();
        if (!pres?.style) return null;
        if (typeof pres.style === "object" && pres.style !== null) {
            return pres.style as {
                backgroundColor?: string;
                textColor?: string;
            };
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

    // Track window dimensions reactively for scale calculation
    // Try to get accurate initial values if window is available
    const getInitialDimensions = () => {
        if (typeof window !== "undefined") {
            return {
                width: window.innerWidth || 1920,
                height: window.innerHeight || 1080,
            };
        }
        return { width: 1920, height: 1080 };
    };

    const initialDims = getInitialDimensions();
    const [windowWidth, setWindowWidth] = createSignal(initialDims.width);
    const [windowHeight, setWindowHeight] = createSignal(initialDims.height);

    const baseWidth = 960;
    const baseHeight = 540;

    // Calculate optimal scale reactively based on viewport size
    // This ensures correct calculation from the first render
    const optimalScale = createMemo(() => {
        // Get viewport dimensions minus padding and header
        const headerHeight = 72; // Approximate header height
        const padding = 32; // 16px on each side
        const availableWidth = windowWidth() - padding;
        const availableHeight = windowHeight() - headerHeight - padding;

        // Calculate scale based on width and height, use the smaller one to fit
        const widthScale = availableWidth / baseWidth;
        const heightScale = availableHeight / baseHeight;

        // Use 95% of the smaller scale to ensure some padding
        const scale = Math.min(widthScale, heightScale) * 0.95;

        // Clamp between reasonable min/max
        return Math.max(0.5, Math.min(2.5, scale));
    });

    onMount(() => {
        // Update window dimensions immediately and after layout
        const updateDimensions = () => {
            setWindowWidth(window.innerWidth);
            setWindowHeight(window.innerHeight);
        };

        // Update immediately
        updateDimensions();

        // Update after layout is complete (handles mobile browser chrome, etc.)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateDimensions();
            });
        });

        // Update on window resize
        const handleResize = () => {
            updateDimensions();
        };

        window.addEventListener("resize", handleResize);
        // Also listen to orientation change on mobile
        window.addEventListener("orientationchange", () => {
            // Wait a bit for orientation change to complete
            setTimeout(updateDimensions, 100);
        });

        return () => {
            window.removeEventListener("resize", handleResize);
            window.removeEventListener("orientationchange", updateDimensions);
        };
    });

    return (
        <div class="bg-bg flex h-screen w-full flex-col overflow-hidden">
            {/* Header with controls and connection status */}
            <div class="border-border-sidebar bg-bg-sidebar flex items-center justify-between border-b px-6 py-4">
                <div class="flex w-full flex-col gap-4 sm:flex-row sm:items-center">
                    <a
                        href="/"
                        class="flex cursor-pointer items-center gap-3 text-white transition-opacity hover:opacity-80"
                        title="Home"
                    >
                        {/* Podcast icon - exact SVG from Lucide */}
                        <svg
                            class="h-6 w-6"
                            xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path
                                d="M13 17a1 1 0 1 0-2 0l.5 4.5a0.5 0.5 0 0 0 1 0z"
                                fill="currentColor"
                            />
                            <path d="M16.85 18.58a9 9 0 1 0-9.7 0" />
                            <path d="M8 14a5 5 0 1 1 8 0" />
                            <circle cx="12" cy="11" r="1" fill="currentColor" />
                        </svg>
                        <h1 class="text-2xl font-bold">Echo</h1>
                    </a>
                    <div class="hidden h-6 w-px bg-gray-600 sm:block"></div>
                    <h1 class="text-xl font-semibold text-white">
                        {presentation()?.name}
                    </h1>
                    <div class="flex items-center gap-2">
                        <div
                            class={`h-2 w-2 rounded-full ${connected() ? "animate-pulse bg-green-500" : peerCount() > 0 ? "animate-pulse bg-yellow-500" : "bg-gray-500"}`}
                        ></div>
                        <span class="text-sm text-gray-400">
                            {connected()
                                ? `${peerCount()} ${peerCount() === 1 ? "peer connected" : "peers connected"}`
                                : peerCount() > 0
                                  ? "Connecting..."
                                  : isPresenter()
                                    ? "Waiting for attendees..."
                                    : "Connecting to presenter..."}
                        </span>
                    </div>
                </div>

                <Show when={isPresenter()}>
                    <div class="flex w-full flex-col items-end justify-center gap-2 sm:flex-row sm:items-start sm:justify-end">
                        <div class="flex items-center gap-2">
                            <button
                                onClick={() => handleSlideNavigation("prev")}
                                disabled={parseInt(slideIndex(), 10) <= 1}
                                class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover flex cursor-pointer justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ "touch-action": "manipulation" }}
                            >
                                <span class="hidden sm:block">←</span>
                                Previous
                            </button>
                            <span class="hidden px-2 text-sm text-gray-400 sm:block">
                                {slideIndex()} / {slides()?.length || 0}
                            </span>
                            <button
                                onClick={() => handleSlideNavigation("next")}
                                disabled={
                                    parseInt(slideIndex(), 10) >=
                                    (slides()?.length || 0)
                                }
                                class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover flex cursor-pointer justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                style={{ "touch-action": "manipulation" }}
                            >
                                Next
                                <span class="hidden sm:block">→</span>
                            </button>
                        </div>

                        <span class="flex gap-1 px-2 text-sm text-gray-400 sm:hidden">
                            <span class="block sm:hidden">Slide: </span>
                            {slideIndex()} / {slides()?.length || 0}
                        </span>
                    </div>
                </Show>

                <Show when={!isPresenter()}>
                    <div class="text-sm text-gray-400">
                        Slide {slideIndex()} of {slides()?.length || 0}
                    </div>
                </Show>
            </div>

            {/* Main slide area */}
            <div 
                class="bg-bg flex flex-1 items-center justify-center overflow-auto p-4"
                style={{ "touch-action": "pan-x pan-y" }}
            >
                <Show
                    when={currentSlideData()}
                    keyed
                    fallback={
                        <div
                            class="relative overflow-hidden rounded-lg shadow-2xl"
                            style={{
                                width: `${baseWidth * optimalScale()}px`,
                                height: `${baseHeight * optimalScale()}px`,
                                "background-color":
                                    presentationStyle()?.backgroundColor ??
                                    defaultStyle.backgroundColor,
                            }}
                        />
                    }
                >
                    {(slide) => (
                        <SlideRenderer
                            slide={slide}
                            scale={optimalScale()}
                            className="shadow-2xl"
                            presentationStyle={presentationStyle()}
                            onButtonClick={handleButtonClick}
                            getVoteCount={getVoteCount}
                            getTotalPollVotes={getTotalPollVotes}
                        />
                    )}
                </Show>
            </div>

            {/* Share link for audience */}
            <Show when={isPresenter()}>
                <div class="border-border-sidebar bg-bg-sidebar border-t px-6 py-4">
                    <div class="flex items-center gap-4">
                        <span class="text-sm text-gray-400">
                            Share this link to let others join:
                        </span>
                        <input
                            type="text"
                            readOnly
                            value={
                                typeof window !== "undefined"
                                    ? `${window.location.origin}/join?code=${encodeURIComponent(props.room.code)}`
                                    : ""
                            }
                            class="border-border-sidebar bg-bg-input text-bg-text flex-1 rounded-lg border px-3 py-2 text-sm"
                            onClick={(e) => e.currentTarget.select()}
                        />
                        <button
                            onClick={async () => {
                                if (typeof window !== "undefined") {
                                    try {
                                        await navigator.clipboard.writeText(
                                            `${window.location.origin}/join?code=${encodeURIComponent(props.room.code)}`,
                                        );
                                        setCopied(true);
                                        // Reset after 2 seconds
                                        setTimeout(() => setCopied(false), 2000);
                                    } catch (err) {
                                        console.error("Failed to copy:", err);
                                    }
                                }
                            }}
                            class={`rounded-lg px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                                copied()
                                    ? "bg-green-600 text-white hover:bg-green-700"
                                    : "bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover"
                            }`}
                        >
                            {copied() ? "Copied!" : "Copy"}
                        </button>
                    </div>
                </div>
            </Show>
        </div>
    );
}
