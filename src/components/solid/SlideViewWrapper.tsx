import { createMemo } from "solid-js";
import { createQuery } from "./primitives/createQuery";
import { createShared, PRESENTATION, useSharedSlides } from "./primitives/createShared";
import { SlideView } from "./SlideView";
import type { Presentation } from "../../lib/db";

export function SlideViewWrapper(props: { presentation: Presentation }) {
    const [slideIndex] = createQuery("slide", "1");
    const [presentation] = createShared<Presentation>(
        PRESENTATION,
        props.presentation,
    );
    
    // Use shared slides to ensure consistency with PresentationSidebar
    const slides = useSharedSlides();
    
    // Get presentation-level style (shared across all slides)
    const presentationStyle = createMemo(() => {
        const pres = presentation();
        if (!pres?.style) return null;
        // Validate it's a style object
        if (typeof pres.style === 'object' && pres.style !== null) {
            return pres.style as { backgroundColor?: string; textColor?: string };
        }
        return null;
    });
    
    // Use createMemo to ensure reactivity when slideIndex or slides change
    const currentSlide = createMemo(() => {
        const index = parseInt(slideIndex(), 10);
        const s = slides();
        const idx = index - 1; // Convert 1-based to 0-based
        return s && idx >= 0 && idx < s.length ? s[idx] : undefined;
    });

    return <SlideView slide={currentSlide} scale={0.7} presentationStyle={presentationStyle()} />;
}

