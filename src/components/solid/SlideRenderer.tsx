import { createSignal, onMount, onCleanup } from "solid-js";
import type { SlideFormat } from "../../lib/slides";

export function parseLocation(location: string): Record<string, string> {
    const style: Record<string, string> = {};
    
    if (location.includes("x:") || location.includes("y:")) {
        const xMatch = location.match(/x:(\d+)/);
        const yMatch = location.match(/y:(\d+)/);
        if (xMatch) style.left = `${xMatch[1]}px`;
        if (yMatch) style.top = `${yMatch[1]}px`;
    } else if (location.includes("top")) {
        style.top = "0";
        if (location.includes("left")) style.left = "0";
        else if (location.includes("right")) style.right = "0";
        else {
            style.left = "50%";
            style.transform = "translateX(-50%)";
        }
    } else if (location.includes("bottom")) {
        style.bottom = "0";
        if (location.includes("left")) style.left = "0";
        else if (location.includes("right")) style.right = "0";
        else {
            style.left = "50%";
            style.transform = "translateX(-50%)";
        }
    } else if (location.includes("center")) {
        style.top = "50%";
        style.left = "50%";
        style.transform = "translate(-50%, -50%)";
    } else {
        style.top = "0";
        style.left = "0";
    }
    
    return style;
}

function ImageElement(props: {
    imageUrl: string;
    width: number;
    height: number;
    locationStyle: Record<string, string>;
}) {
    const [imageError, setImageError] = createSignal(false);
    const [imageLoaded, setImageLoaded] = createSignal(false);
    let img: HTMLImageElement | null = null;

    onMount(() => {
        if (typeof window === "undefined") return;
        
        // Preload image to detect errors
        img = new Image();
        img.onload = () => setImageLoaded(true);
        img.onerror = () => {
            setImageError(true);
            setImageLoaded(false);
        };
        img.src = props.imageUrl;
    });

    onCleanup(() => {
        if (img) {
            img.onload = null;
            img.onerror = null;
            img = null;
        }
    });

    // Don't render if image failed to load
    if (imageError()) {
        return null;
    }

    return (
        <img
            src={props.imageUrl}
            alt=""
            class="absolute object-contain"
            style={{
                ...props.locationStyle,
                width: `${props.width}px`,
                height: `${props.height}px`,
                display: imageLoaded() ? "block" : "none",
            }}
            onError={() => setImageError(true)}
        />
    );
}

interface SlideRendererProps {
    slide: SlideFormat;
    scale?: number;
    showAllElements?: boolean;
    className?: string;
}

export function SlideRenderer(props: SlideRendererProps) {
    const scale = props.scale ?? 1;
    const slide = props.slide;
    const baseWidth = 960;
    const baseHeight = 540;
    
    // Calculate scaled dimensions
    const width = baseWidth * scale;
    const height = baseHeight * scale;
    
    // Scale padding proportionally
    const titlePadding = 32 * scale; // p-8 = 32px
    const titleBottomPadding = 16 * scale; // pb-4 = 16px
    const contentPadding = 32 * scale; // p-8 = 32px
    const contentTopPadding = 80 * scale; // pt-20 = 80px
    
    // Scale font sizes proportionally
    const titleFontSize = 36 * scale; // text-4xl ≈ 36px

    const elements = props.showAllElements !== false 
        ? slide.content.elements 
        : slide.content.elements.slice(0, 2);

    return (
        <div
            class={`relative overflow-hidden rounded-lg ${props.className || ""}`}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                "background-color": slide.backgroundColor,
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
                        color: slide.textColor,
                        "font-size": `${titleFontSize}px`,
                        "line-height": "1.2",
                        "word-wrap": "break-word",
                        "overflow-wrap": "break-word",
                    }}
                >
                    {slide.title}
                </h2>
            </div>

            {/* Slide Elements */}
            <div
                class="absolute inset-0"
                style={{
                    padding: `${contentPadding}px`,
                    "padding-top": `${contentTopPadding}px`,
                }}
            >
                {elements.map((element, idx) => {
                    const locationStyle = parseLocation(element.location);
                    if (element.type === "text") {
                        return (
                            <div
                                key={idx}
                                class="absolute whitespace-pre-wrap break-words"
                                style={{
                                    ...locationStyle,
                                    color: element.color,
                                    "font-size": `${element.fontSize * scale}px`,
                                    "max-width": "100%",
                                }}
                            >
                                {element.text}
                            </div>
                        );
                    } else if (element.type === "image") {
                        return (
                            <ImageElement
                                key={idx}
                                imageUrl={element.imageUrl}
                                width={element.width * scale}
                                height={element.height * scale}
                                locationStyle={locationStyle}
                            />
                        );
                    }
                    return null;
                })}
            </div>
        </div>
    );
}

