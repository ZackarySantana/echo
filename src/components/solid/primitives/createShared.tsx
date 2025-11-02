import { createRoot, createSignal, createMemo, type Accessor, type Setter } from "solid-js";
import { parseSlides } from "../../../scripts/slides";
import type { SlideFormat } from "../../../lib/slides";

export const PRESENTATION = "presentation";
export const SLIDES = "slides";

type Refresh = () => Promise<void>;

const refetchForKeys: Record<string, (data: any) => string | undefined> = {
    [PRESENTATION]: (data) => {
        if (!data) return;

        return `/api/presentation/${data.id}`;
    },
};

export function createShared<T = any>(
    key: string,
    initial?: T,
): [Accessor<T | null>, Setter<T | null>, Refresh] {
    const w = window as any;

    if (!w[key]) {
        w[key] = createRoot(() => {
            const [data, setData] = createSignal<T | null>(initial ?? null, {
                equals: false,
            });

            let refresh: Refresh = async () => {};
            if (refetchForKeys[key]) {
                refresh = async () => {
                    const path = refetchForKeys[key](data());
                    if (!path) return;

                    const fresh = await (await fetch(path)).json();
                    setData(fresh);
                };
            }

            return [data, setData, refresh];
        });
    } else if (initial != null && w[key][0]() == null) {
        // seed once from SSR in whichever island mounts first
        w[key][1](initial);
    }

    return w[key] as [Accessor<T | null>, Setter<T | null>, Refresh];
}

/**
 * Shared slides parser - ensures all components use the same parsed slides array
 */
export function useSharedSlides(): Accessor<SlideFormat[] | null> {
    const w = window as any;
    
    if (!w[SLIDES]) {
        const [presentation] = createShared<any>(PRESENTATION);
        
        w[SLIDES] = createRoot(() => {
            // Create a memoized parsed slides that updates when presentation changes
            const parsed = createMemo(() => {
                const pres = presentation();
                if (!pres?.slides) return null;
                return parseSlides(pres.slides);
            });
            
            return parsed;
        });
    }
    
    return w[SLIDES] as Accessor<SlideFormat[] | null>;
}
