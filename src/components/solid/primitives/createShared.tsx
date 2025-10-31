import { createRoot, createSignal, type Accessor, type Setter } from "solid-js";

type Refresh = () => Promise<void>;

export function createShared<T = any>(
    key: string,
    initial?: T,
    refetchPath?: string,
): [Accessor<T | null>, Setter<T | null>, Refresh] {
    const w = window as any;

    if (!w[key]) {
        w[key] = createRoot(() => {
            const [data, setData] = createSignal<T | null>(initial ?? null, {
                equals: false,
            });

            let refresh: Refresh = async () => {};
            if (refetchPath) {
                refresh = async () => {
                    const fresh = await (await fetch(refetchPath)).json();
                    setData(fresh);
                };
            }

            return [data, setData, refresh];
        });
    } else if (initial != null && w[key].data() == null) {
        // seed once from SSR in whichever island mounts first
        w[key].setData(initial);
    }

    return w[key] as [Accessor<T | null>, Setter<T | null>, Refresh];
}
