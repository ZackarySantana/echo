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
            <h1 class="pl-3 text-xl font-semibold text-white">
                {presentation()?.name}
            </h1>

            <div class="pl-3">
                <p class="text-md mt-2 font-medium text-gray-200">Slides</p>
                <p class="text-base text-gray-500">
                    {slide()} of {slides()?.length || 0}
                </p>
            </div>

            <div class="mt-4 flex flex-col gap-2">
                <For each={slides()}>
                    {(s, i) => (
                        <button
                            class={`w-full cursor-pointer rounded-md p-3 text-left transition-all hover:bg-gray-800 ${
                                slide() === (i() + 1).toString()
                                    ? "bg-gray-800"
                                    : ""
                            }`}
                            onClick={() => setSlide(i() + 1)}
                        >
                            <p class="font-medium text-white">{s.title}</p>
                        </button>
                    )}
                </For>
            </div>
        </>
    );
}
