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

    // Vonage connection state
    const [connected, setConnected] = createSignal(false);
    const [attendeeCount, setAttendeeCount] = createSignal(0);
    const [isPresenter, setIsPresenter] = createSignal(false);

    // Copy button animation state
    const [copied, setCopied] = createSignal(false);

    // Vote tracking state
    // Structure: voteCounts[pollId][buttonId] = count
    const [voteCounts, setVoteCounts] = createSignal<
        Record<string, Record<string, number>>
    >({});
    // Track which button each user voted for: peerVotes[pollId][userId] = buttonId
    const [peerVotes, setPeerVotes] = createSignal<
        Record<string, Record<string, string>>
    >({});

    let client: any = null;
    let session: any = null;
    let conversation: any = null;
    let conversationId: string = "";
    let userId: string = "";
    let memberPollInterval: number | null = null;

    // Determine if user is presenter (owner)
    onMount(async () => {
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

        // Initialize Vonage client and join conversation
        try {
            // Get JWT token
            const jwtResponse = await fetch("/api/vonage/jwt");
            if (!jwtResponse.ok) {
                throw new Error("Failed to get JWT token");
            }
            const { token, userId: vonageUserId } = await jwtResponse.json();
            userId = vonageUserId;

            // Dynamically import Vonage client SDK (only works in browser)
            const VonageClient = (await import("@vonage/client-sdk")).VonageClient;
            
            // Initialize client
            client = new VonageClient();
            session = await client.createSession(token);

            // Join or create conversation
            const convResponse = await fetch("/api/vonage/conversation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomCode: props.room.code }),
            });
            if (!convResponse.ok) {
                throw new Error("Failed to join conversation");
            }
            const { conversationId: convId } = await convResponse.json();
            conversationId = convId;

            // Explicitly join the conversation to receive events
            // This is required even though the backend already added us as a member
            try {
                const memberId = await client.joinConversation(conversationId);
                console.log("Joined conversation with member ID:", memberId);
            } catch (error: any) {
                // If already joined, that's OK - backend already added us
                const isAlreadyJoined = 
                    error.code === "conversation:error:member-already-joined" ||
                    error.type?.includes("member-already-joined") ||
                    (error.message && error.message.includes("already")) ||
                    (error.detail && error.detail.includes("already"));
                
                if (isAlreadyJoined) {
                    console.log("Already a member of conversation (backend added us), continuing...");
                } else {
                    console.warn("Warning joining conversation:", error);
                    // Still continue - we might still be able to receive events
                }
            }

            // Get conversation (method is on client, not session)
            conversation = await client.getConversation(conversationId);

            // Set up event listeners (must be after joining)
            setupConversationListeners();

            // Update connection status
            setConnected(true);
            await updateMemberCount();

            // Start polling for member count updates
            memberPollInterval = setInterval(async () => {
                await updateMemberCount();
            }, 2000) as unknown as number;

            // If presenter, send current slide state
            if (isPresenter()) {
                const current = parseInt(slideIndex(), 10);
                if (current > 0) {
                    await sendSlideChange(current);
                }
                // Send current vote state
                const currentVotes = voteCounts();
                const currentPeerVotes = peerVotes();
                if (Object.keys(currentVotes).length > 0) {
                    await sendVoteStateSync(currentVotes, currentPeerVotes);
                }
            }
        } catch (error) {
            console.error("Error initializing Vonage:", error);
        }

        return () => {
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

        // Clear member polling
        if (memberPollInterval !== null) {
            clearInterval(memberPollInterval);
            memberPollInterval = null;
        }

        // Leave conversation
        if (conversation && userId) {
            fetch("/api/vonage/conversation", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomCode: props.room.code }),
            }).catch(console.error);
        }

        setConnected(false);
        setAttendeeCount(0);
    }

    function setupConversationListeners() {
        if (!client || !conversation) {
            console.warn("Cannot setup conversation listeners - client or conversation missing", { client: !!client, conversation: !!conversation });
            return;
        }

        console.log("Setting up conversation listeners for", isPresenter() ? "presenter" : "attendee", { conversationId });

        // Listen for conversation events (custom events, member events, etc.)
        // This should receive events from ALL members in the conversation
        client.on("conversationEvent", (event: any) => {
            console.log("Received conversation event:", event.kind, event.eventType, event);
            
            // Check if this event is from the current conversation
            if (event.conversationId && event.conversationId !== conversationId) {
                console.log("Ignoring event from different conversation", event.conversationId, "vs", conversationId);
                return;
            }
            
            switch (event.kind) {
                case "custom":
                    // Handle custom event
                    if (event.eventType === "custom:slide-change" || 
                        event.eventType === "custom:poll-vote" || 
                        event.eventType === "custom:vote-state-sync") {
                        // Custom data is directly in event.body based on the structure we saw
                        const data = event.body;
                        if (data && typeof data === 'object') {
                            console.log("Processing custom event data:", data, "for", isPresenter() ? "presenter" : "attendee");
                            handleConversationEvent(data);
                        } else {
                            console.warn("Custom event data not found or invalid:", event);
                        }
                    }
                    break;
                case "member:joined":
                    updateMemberCount();
                    break;
                case "member:left":
                    updateMemberCount();
                    break;
                case "text":
                    // Fallback: handle text messages that might contain JSON
                    try {
                        const text = event.body?.text?.text || event.body?.text || event.text;
                        if (text) {
                            const data = JSON.parse(text);
                            handleConversationEvent(data);
                        }
                    } catch (e) {
                        // Not JSON, ignore
                    }
                    break;
            }
        });
        
        // Also try listening on conversation object if it has event listeners
        if (conversation && typeof conversation.on === 'function') {
            console.log("Also setting up listener on conversation object");
            conversation.on("conversationEvent", (event: any) => {
                console.log("Received event from conversation object:", event);
            });
        }
    }

    async function handleConversationEvent(data: any) {
        console.log("Handling conversation event:", data);
        
        if (data.type === "slide-change") {
            const newIndex =
                typeof data.slideIndex === "string"
                    ? parseInt(data.slideIndex, 10)
                    : data.slideIndex;
            if (!isNaN(newIndex) && !isPresenter()) {
                // Only update if not presenter (presenter controls slides)
                console.log("Updating slide index to:", newIndex, "for attendee");
                setSlideIndex(newIndex);
            }
        } else if (data.type === "poll-vote") {
            handleIncomingVote(data.pollId, data.buttonId, data.userId);
        } else if (data.type === "vote-state-sync") {
            if (data.votes && data.peerVotes) {
                setVoteCounts(data.votes);
                setPeerVotes(data.peerVotes);
                scheduleVoteSave();
            }
        }
    }

    async function updateMemberCount() {
        try {
            const response = await fetch(
                `/api/vonage/conversation?roomCode=${props.room.code}`
            );
            if (response.ok) {
                const { members } = await response.json();
                const count = members.length > 0 ? members.length - 1 : 0; // Exclude self
                setAttendeeCount(count);
            }
        } catch (error) {
            console.error("Error updating member count:", error);
        }
    }

    async function sendSlideChange(newIndex: number) {
        if (!client || !conversationId || !isPresenter()) return;

        const eventData = {
            type: "slide-change",
            slideIndex: newIndex.toString(),
        };

        try {
            // Send as custom event using client SDK
            await client.sendCustomEvent(conversationId, "custom:slide-change", eventData);
        } catch (error) {
            console.error("Error sending slide change:", error);
            // Fallback to text message if custom events not supported
            try {
                await client.sendMessageTextEvent(conversationId, JSON.stringify(eventData));
            } catch (e) {
                console.error("Error sending slide change as text:", e);
            }
        }
    }

    async function sendVoteEvent(pollId: string, buttonId: string) {
        if (!client || !conversationId) return;

        const eventData = {
            type: "poll-vote",
            pollId,
            buttonId,
            userId,
        };

        try {
            await client.sendCustomEvent(conversationId, "custom:poll-vote", eventData);
        } catch (error) {
            console.error("Error sending vote event:", error);
            // Fallback to text message
            try {
                await client.sendMessageTextEvent(conversationId, JSON.stringify(eventData));
            } catch (e) {
                console.error("Error sending vote as text:", e);
            }
        }
    }

    async function sendVoteStateSync(
        votes: Record<string, Record<string, number>>,
        peerVotes: Record<string, Record<string, string>>
    ) {
        if (!client || !conversationId || !isPresenter()) return;

        const eventData = {
            type: "vote-state-sync",
            votes,
            peerVotes,
        };

        try {
            await client.sendCustomEvent(conversationId, "custom:vote-state-sync", eventData);
        } catch (error) {
            console.error("Error sending vote state sync:", error);
            // Fallback to text message
            try {
                await client.sendMessageTextEvent(conversationId, JSON.stringify(eventData));
            } catch (e) {
                console.error("Error sending vote state as text:", e);
            }
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

        // Broadcast via Vonage
        await sendSlideChange(newIndex);
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
        handleVote(pollId, buttonId, userId, true);

        // Send vote via Vonage
        sendVoteEvent(pollId, buttonId);
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
        voterUserId: string,
        isLocalVote: boolean = false,
    ) {
        setVoteCounts((prev) => {
            const newCounts = { ...prev };
            const peerVotesState = peerVotes();

            // Check if this user already voted for a different button in this poll
            const existingVote = peerVotesState[pollId]?.[voterUserId];

            if (existingVote && existingVote !== buttonId) {
                // User changed their vote - decrement old button, increment new button
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
            // If existingVote === buttonId, user clicked the same button again - ignore

            return newCounts;
        });

        // Update peer votes tracking
        setPeerVotes((prev) => {
            const newPeerVotes = { ...prev };
            if (!newPeerVotes[pollId]) {
                newPeerVotes[pollId] = {};
            }
            newPeerVotes[pollId][voterUserId] = buttonId;
            return newPeerVotes;
        });

        // Schedule save to database (debounced)
        scheduleVoteSave();
    }

    function handleIncomingVote(
        pollId: string,
        buttonId: string,
        voterUserId: string,
    ) {
        // Only update if this vote is from another user
        if (voterUserId !== userId) {
            handleVote(pollId, buttonId, voterUserId, false);
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
                            class={`h-2 w-2 rounded-full ${connected() ? "animate-pulse bg-green-500" : "bg-gray-500"}`}
                        ></div>
                        <span class="text-sm text-gray-400">
                            {connected()
                                ? `${attendeeCount()} ${attendeeCount() === 1 ? "attendee connected" : "attendees connected"}`
                                : isPresenter()
                                  ? "Connecting..."
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
