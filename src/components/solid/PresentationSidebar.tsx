import { For } from "solid-js";
import type { Presentation } from "../../lib/db";
import { createQuery } from "./primitives/createQuery";
import { createShared, PRESENTATION, useSharedSlides } from "./primitives/createShared";
import type { SlideFormat } from "../../lib/slides";
import { SlideRenderer } from "./SlideRenderer";

function SlideThumbnail(props: { 
    slide: SlideFormat;
    isSelected: boolean;
    presentationStyle?: { backgroundColor?: string; textColor?: string } | null;
}) {
    // Calculate scale to fit thumbnail nicely
    const thumbnailScale = 0.2;
    
    return (
        <div class="w-full flex justify-center">
            <SlideRenderer
                slide={props.slide}
                scale={thumbnailScale}
                presentationStyle={props.presentationStyle}
            />
        </div>
    );
}

export function PresentationSidebar(props: { presentation: Presentation }) {
    const [slideIndex, setSlide] = createQuery("slide", "1");

    const [presentation] = createShared<Presentation>(
        PRESENTATION,
        props.presentation,
    );
    
    // Use shared slides to ensure consistency with SlideViewWrapper
    const slides = useSharedSlides();
    
    // Get presentation-level style (shared across all slides)
    const presentationStyle = () => {
        const pres = presentation();
        if (!pres?.style) return null;
        // Validate it's a style object
        if (typeof pres.style === 'object' && pres.style !== null) {
            return pres.style as { backgroundColor?: string; textColor?: string };
        }
        return null;
    };

    // Helper to get current slide by index
    const getSlideByIndex = (index: number): SlideFormat | undefined => {
        const s = slides();
        const idx = index - 1; // Convert 1-based to 0-based
        return s && idx >= 0 && idx < s.length ? s[idx] : undefined;
    };

    return (
        <>
            <h1 class="pl-3 text-xl font-semibold text-white">
                {presentation()?.name}
            </h1>

            <div class="pl-3">
                <p class="text-md mt-2 font-medium text-gray-200">Slides</p>
                <p class="text-base text-gray-500">
                    {slideIndex()} of {slides()?.length || 0}
                </p>
            </div>

            <div class="mt-4 flex flex-col gap-3 px-3">
                <For each={slides()}>
                    {(s, i) => {
                        const slideNum = i() + 1;
                        const isSelected = slideIndex() === slideNum.toString();
                        // Always use getSlideByIndex to ensure we get the exact same slide object
                        // that the main view uses (in case the presentation data was updated)
                        const slideData = getSlideByIndex(slideNum);
                        if (!slideData) return null;
                        
                        return (
                            <button
                                class={`cursor-pointer rounded-md border-2 p-2 transition-all hover:border-blue-500 ${
                                    isSelected
                                        ? "border-blue-500 bg-gray-800"
                                        : "border-gray-700"
                                }`}
                                onClick={() => setSlide(slideNum.toString())}
                                        >
                                            <SlideThumbnail 
                                                slide={slideData} 
                                                isSelected={isSelected}
                                                presentationStyle={presentationStyle()}
                                            />
                                            <p class="mt-2 text-xs font-medium text-white line-clamp-1">
                                                {slideData.title}
                                            </p>
                                        </button>
                        );
                    }}
                </For>
            </div>
        </>
    );
}
