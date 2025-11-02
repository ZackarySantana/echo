import { createMemo } from "solid-js";
import { createQuery } from "./primitives/createQuery";
import { createShared, PRESENTATION } from "./primitives/createShared";
import { parseSlides } from "../../scripts/slides";
import { SlideView } from "./SlideView";
import type { Presentation } from "../../lib/db";

export function SlideViewWrapper(props: { presentation: Presentation }) {
    const [slideIndex] = createQuery("slide", "1");
    const [presentation] = createShared<Presentation>(
        PRESENTATION,
        props.presentation,
    );
    
    const slides = () => parseSlides(presentation()?.slides);
    
    // Use createMemo to ensure reactivity when slideIndex or slides change
    const currentSlide = createMemo(() => {
        const index = parseInt(slideIndex(), 10);
        const s = slides();
        const idx = index - 1; // Convert 1-based to 0-based
        return s && idx >= 0 && idx < s.length ? s[idx] : undefined;
    });

    return <SlideView slide={currentSlide} scale={0.7} />;
}

