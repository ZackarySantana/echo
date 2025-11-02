import { For } from "solid-js";
import type { Presentation } from "../../lib/db";
import { SlideFormatSchema } from "../../lib/slides";
import { parseSlides } from "../../scripts/slides";
import { createQuery } from "./primitives/createQuery";
import { createShared, PRESENTATION } from "./primitives/createShared";

export function PresentationSidebar(props: { presentation: Presentation }) {
    const [slide, setSlide] = createQuery("slide", "1");

    const [presentation] = createShared<Presentation>(
        PRESENTATION,
        props.presentation,
    );
    const slides = () => parseSlides(presentation()?.slides);

    // parse the slides of a presentation.

    return (
        <>
            <h1 class="text-xl font-semibold text-white">
                {presentation()?.name}
            </h1>

            <div>
                <p class="text-md mt-5 font-medium">Slides</p>
                <p class="text-base text-gray-500">
                    {slide()} of {slides()?.length || 0}
                </p>
            </div>

            <For each={slides()}>
                {(s, i) => (
                    <div
                        class={`cursor-pointer rounded-md p-3 hover:bg-gray-800 ${
                            slide() === (i() + 1).toString()
                                ? "bg-gray-800"
                                : ""
                        }`}
                        onClick={() => setSlide(i() + 1)}
                    >
                        <p class="font-medium text-white">{s.title}</p>
                    </div>
                )}
            </For>
        </>
    );
}
