import { Show, type Accessor } from "solid-js";
import type { SlideFormat } from "../../lib/slides";
import { SlideRenderer } from "./SlideRenderer";
import { getDefaultPresentationStyle } from "../../lib/presentation-styles";

interface Props {
    slide: Accessor<SlideFormat | undefined>;
    scale?: number;
    presentationStyle?: { backgroundColor?: string; textColor?: string } | null;
}

export function SlideView(props: Props) {
    const scale = () => props.scale ?? 0.7;
    const slide = () => props.slide();
    const presentationStyle = () => props.presentationStyle;
    const defaultStyle = getDefaultPresentationStyle();

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
                            "background-color": presentationStyle()?.backgroundColor ?? defaultStyle.backgroundColor,
                        }}
                    />
                }
            >
                {(s) => (
                    <SlideRenderer
                        slide={s}
                        scale={scale()}
                        className="shadow-2xl"
                        presentationStyle={presentationStyle()}
                    />
                )}
            </Show>
        </div>
    );
}

