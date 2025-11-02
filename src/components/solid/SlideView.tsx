import { Show, type Accessor } from "solid-js";
import type { SlideFormat } from "../../lib/slides";
import { SlideRenderer } from "./SlideRenderer";

interface Props {
    slide: Accessor<SlideFormat | undefined>;
    scale?: number;
}

export function SlideView(props: Props) {
    const scale = () => props.scale ?? 0.7;
    const slide = () => props.slide();

    return (
        <div class="flex h-full w-full items-center justify-center p-8">
            <Show
                when={slide()}
                keyed
                fallback={
                    <div
                        class="relative overflow-hidden rounded-lg shadow-2xl"
                        style={{
                            width: `${960 * scale()}px`,
                            height: `${540 * scale()}px`,
                            "background-color": "#ffffff",
                        }}
                    />
                }
            >
                {(s) => (
                    <SlideRenderer
                        slide={s}
                        scale={scale()}
                        className="shadow-2xl"
                    />
                )}
            </Show>
        </div>
    );
}

