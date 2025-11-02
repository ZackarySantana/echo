import { createSignal, onMount, onCleanup, For } from "solid-js";
import type { SlideFormat, ImageInfo } from "../../lib/slides";
import { SlideButton } from "./SlideButton";
import { getDefaultPresentationStyle } from "../../lib/presentation-styles";

function ImageElement(props: {
    image: ImageInfo;
    scale: number;
}) {
    const [imageError, setImageError] = createSignal(false);
    const [imageLoaded, setImageLoaded] = createSignal(false);
    let img: HTMLImageElement | null = null;

    const imageUrl = () => props.image.url || "";

    onMount(() => {
        if (typeof window === "undefined" || !imageUrl()) return;
        
        img = new Image();
        img.onload = () => setImageLoaded(true);
        img.onerror = () => {
            setImageError(true);
            setImageLoaded(false);
        };
        img.src = imageUrl();
    });

    onCleanup(() => {
        if (img) {
            img.onload = null;
            img.onerror = null;
            img = null;
        }
    });

    if (!imageUrl() || imageError()) {
        // Show placeholder or description if image fails or URL missing
        return (
            <div class="flex items-center justify-center rounded-lg border-2 border-dashed border-gray-400 p-8 text-gray-500">
                <div class="text-center">
                    <p class="text-sm">{props.image.description || "Image"}</p>
                    {props.image.caption && (
                        <p class="mt-2 text-xs italic">{props.image.caption}</p>
                    )}
                </div>
            </div>
        );
    }

    const positionStyles = () => {
        const position = props.image.position;
        const styles: Record<string, string> = {};
        
        switch (position) {
            case "left":
                styles.position = "absolute";
                styles.left = "0";
                styles.top = "50%";
                styles.transform = "translateY(-50%)";
                break;
            case "right":
                styles.position = "absolute";
                styles.right = "0";
                styles.top = "50%";
                styles.transform = "translateY(-50%)";
                break;
            case "center":
                styles.position = "absolute";
                styles.top = "50%";
                styles.left = "50%";
                styles.transform = "translate(-50%, -50%)";
                break;
            case "full":
                styles.position = "absolute";
                styles.top = "0";
                styles.left = "0";
                styles.width = "100%";
                styles.height = "100%";
                styles.objectFit = "cover";
                break;
            case "top":
                styles.position = "absolute";
                styles.top = "0";
                styles.left = "50%";
                styles.transform = "translateX(-50%)";
                break;
            case "bottom":
                styles.position = "absolute";
                styles.bottom = "0";
                styles.left = "50%";
                styles.transform = "translateX(-50%)";
                break;
            default:
                styles.position = "absolute";
                styles.top = "50%";
                styles.left = "50%";
                styles.transform = "translate(-50%, -50%)";
        }
        
        return styles;
    };

    return (
        <div style={positionStyles()}>
            <img
                src={imageUrl()}
                alt={props.image.caption || props.image.description}
                class="max-h-full max-w-full object-contain"
                style={{
                    display: imageLoaded() ? "block" : "none",
                }}
                onError={() => setImageError(true)}
            />
            {props.image.caption && (
                <p class="mt-2 text-center text-xs italic text-gray-600" style={{
                    "font-size": `${12 * props.scale}px`,
                }}>
                    {props.image.caption}
                </p>
            )}
        </div>
    );
}

interface SlideRendererProps {
    slide: SlideFormat;
    scale?: number;
    className?: string;
    onButtonClick?: (buttonId: string, pollId: string) => void;
    presentationStyle?: { backgroundColor?: string; textColor?: string } | null;
}

export function SlideRenderer(props: SlideRendererProps) {
    const scale = props.scale ?? 1;
    const slide = props.slide;
    const presentationStyle = props.presentationStyle;
    const baseWidth = 960;
    const baseHeight = 540;
    
    // Calculate scaled dimensions
    const width = baseWidth * scale;
    const height = baseHeight * scale;
    
    // Scale padding and font sizes
    const titlePadding = 32 * scale;
    const titleBottomPadding = 16 * scale;
    const contentPadding = 32 * scale;
    const contentTopPadding = 80 * scale;
    const titleFontSize = 36 * scale;
    const subtitleFontSize = 24 * scale;
    const textFontSize = 18 * scale;
    const bulletFontSize = 16 * scale;

    // Get polls and buttons from content
    const polls = () => slide.content.polls || [];
    const buttons = () => slide.content.buttons || [];

    // Helper to get poll by ID
    const getPollById = (pollId: string) => {
        return polls().find(p => p.id === pollId);
    };

    // Get style properties - use slide-specific style, fallback to presentation default, then global app theme defaults
    const defaultStyle = getDefaultPresentationStyle();
    const backgroundColor = () => 
        slide.style?.backgroundColor ?? 
        presentationStyle?.backgroundColor ?? 
        defaultStyle.backgroundColor;
    const textColor = () => 
        slide.style?.textColor ?? 
        presentationStyle?.textColor ?? 
        defaultStyle.textColor;

    const renderContent = () => {
        switch (slide.format) {
            case "title-only":
                return (
                    <div class="flex flex-col items-center justify-center h-full">
                        {slide.content.image && (
                            <ImageElement image={slide.content.image} scale={scale} />
                        )}
                    </div>
                );

            case "title-subtitle":
                return (
                    <div class="flex flex-col items-center justify-center h-full text-center">
                        <h3
                            class="font-semibold mb-4"
                            style={{
                                color: textColor(),
                                "font-size": `${subtitleFontSize}px`,
                                "line-height": "1.4",
                            }}
                        >
                            {slide.content.subtitle}
                        </h3>
                        {slide.content.image && (
                            <ImageElement image={slide.content.image} scale={scale} />
                        )}
                    </div>
                );

            case "title-bullets":
                return (
                    <div class="flex flex-col h-full">
                        <ul class="list-disc list-inside space-y-2">
                            <For each={slide.content.bullets}>
                                {(bullet) => (
                                    <li
                                        class="text-left"
                                        style={{
                                            color: textColor(),
                                            "font-size": `${bulletFontSize}px`,
                                            "line-height": "1.6",
                                        }}
                                    >
                                        {bullet}
                                    </li>
                                )}
                            </For>
                        </ul>
                        {slide.content.image && (
                            <div class="mt-4">
                                <ImageElement image={slide.content.image} scale={scale} />
                            </div>
                        )}
                    </div>
                );

            case "title-paragraph":
                return (
                    <div class="flex flex-col h-full">
                        <p
                            class="text-left whitespace-pre-wrap"
                            style={{
                                color: textColor(),
                                "font-size": `${textFontSize}px`,
                                "line-height": "1.6",
                            }}
                        >
                            {slide.content.paragraph}
                        </p>
                        {slide.content.image && (
                            <div class="mt-4">
                                <ImageElement image={slide.content.image} scale={scale} />
                            </div>
                        )}
                    </div>
                );

            case "title-2columns":
                return (
                    <div class="grid grid-cols-2 gap-8 h-full">
                        <div class="text-left">
                            <p
                                class="whitespace-pre-wrap"
                                style={{
                                    color: textColor(),
                                    "font-size": `${textFontSize}px`,
                                    "line-height": "1.6",
                                }}
                            >
                                {slide.content.leftColumn}
                            </p>
                        </div>
                        <div class="text-left">
                            <p
                                class="whitespace-pre-wrap"
                                style={{
                                    color: textColor(),
                                    "font-size": `${textFontSize}px`,
                                    "line-height": "1.6",
                                }}
                            >
                                {slide.content.rightColumn}
                            </p>
                        </div>
                        {slide.content.image && (
                            <div class="col-span-2 flex justify-center">
                                <ImageElement image={slide.content.image} scale={scale} />
                            </div>
                        )}
                    </div>
                );

            case "title-image":
                return (
                    <div class="flex items-center justify-center h-full">
                        <ImageElement image={slide.content.image} scale={scale} />
                    </div>
                );

            case "comparison":
                return (
                    <div class="grid grid-cols-2 gap-8 h-full">
                        <div class="text-left">
                            <h4
                                class="font-semibold mb-3"
                                style={{
                                    color: textColor(),
                                    "font-size": `${subtitleFontSize}px`,
                                }}
                            >
                                {slide.content.leftTitle}
                            </h4>
                            <ul class="list-disc list-inside space-y-2">
                                <For each={slide.content.leftItems}>
                                    {(item) => (
                                        <li
                                            style={{
                                                color: textColor(),
                                                "font-size": `${bulletFontSize}px`,
                                                "line-height": "1.6",
                                            }}
                                        >
                                            {item}
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                        <div class="text-left">
                            <h4
                                class="font-semibold mb-3"
                                style={{
                                    color: textColor(),
                                    "font-size": `${subtitleFontSize}px`,
                                }}
                            >
                                {slide.content.rightTitle}
                            </h4>
                            <ul class="list-disc list-inside space-y-2">
                                <For each={slide.content.rightItems}>
                                    {(item) => (
                                        <li
                                            style={{
                                                color: textColor(),
                                                "font-size": `${bulletFontSize}px`,
                                                "line-height": "1.6",
                                            }}
                                        >
                                            {item}
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </div>
                        {slide.content.image && (
                            <div class="col-span-2 flex justify-center">
                                <ImageElement image={slide.content.image} scale={scale} />
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div
            class={`relative overflow-hidden rounded-lg ${props.className || ""}`}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                "background-color": backgroundColor(),
            }}
        >
            {/* Slide Title */}
            <div
                class="absolute left-0 right-0 top-0"
                style={{
                    padding: `${titlePadding}px`,
                    "padding-bottom": `${titleBottomPadding}px`,
                }}
            >
                <h2
                    class="font-bold break-words"
                    style={{
                        color: textColor(),
                        "font-size": `${titleFontSize}px`,
                        "line-height": "1.2",
                        "word-wrap": "break-word",
                        "overflow-wrap": "break-word",
                    }}
                >
                    {slide.title}
                </h2>
            </div>

            {/* Slide Content */}
            <div
                class="absolute inset-0"
                style={{
                    padding: `${contentPadding}px`,
                    "padding-top": `${contentTopPadding}px`,
                }}
            >
                {renderContent()}

                {/* Interactive Elements: Buttons and Polls */}
                {(buttons().length > 0 || polls().length > 0) && (
                    <div class="absolute bottom-0 left-0 right-0 flex flex-wrap items-center justify-center gap-2" style={{
                        padding: `${contentPadding}px`,
                        "padding-top": "16px",
                        "padding-bottom": `${contentPadding}px`,
                    }}>
                        <For each={buttons()}>
                            {(button) => {
                                const poll = getPollById(button.pollId);
                                return (
                                    <SlideButton
                                        button={button}
                                        poll={poll}
                                        scale={scale}
                                        onClick={(btn, p) => {
                                            if (props.onButtonClick) {
                                                props.onButtonClick(button.pollId, button.pollId);
                                            }
                                        }}
                                    />
                                );
                            }}
                        </For>
                    </div>
                )}

                {/* Display vote counts for accumulator polls */}
                <For each={polls()}>
                    {(poll) => {
                        if (poll.type === "accumulator" && poll.displayOnSlide) {
                            return (
                                <div
                                    class="absolute top-4 right-4 rounded-lg bg-blue-100 px-3 py-2 text-blue-800"
                                    style={{
                                        "font-size": `${14 * scale}px`,
                                    }}
                                >
                                    {/* TODO: Integrate with vote tracking system */}
                                    Votes: 0
                                </div>
                            );
                        }
                        return null;
                    }}
                </For>
            </div>
        </div>
    );
}
