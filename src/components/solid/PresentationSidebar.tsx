import type { Project } from "../../lib/db";
import { createQuery } from "./primitives/createQuery";

export function PresentationSidebar(props: { presentation: Project }) {
    const slide = createQuery("slide", "1");

    return (
        <>
            <h1 class="text-xl font-semibold text-white">
                {props.presentation.name}
            </h1>

            <div>
                <p class="text-md mt-5 font-medium">Slides</p>
                <p class="text-base text-gray-500">{slide()} of 4</p>
            </div>
        </>
    );
}
