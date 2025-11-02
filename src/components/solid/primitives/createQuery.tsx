import {
    createSignal,
    createRoot,
    type Accessor,
    type Setter,
} from "solid-js";

export function createQuery(
    key: string,
    defaultValue: string = "",
): [Accessor<string>, Setter<number>] {
    const w = window as any;
    const storageKey = `__query_${key}`;

    // Create shared signal for this query key if it doesn't exist
    if (!w[storageKey]) {
        w[storageKey] = createRoot(() => {
            const [search, setSearch] = createSignal(
                new URLSearchParams(window.location.search),
            );

            const update = () => setSearch(new URLSearchParams(window.location.search));

            // Set up event listeners on first creation only
            if (typeof window !== "undefined") {
                window.addEventListener("popstate", update);
                window.addEventListener("hashchange", update);
                window.addEventListener("locationchange", update);
            }

            return [search, setSearch, update];
        });
    }

    const [search, setSearch, update] = w[storageKey] as [
        Accessor<URLSearchParams>,
        Setter<URLSearchParams>,
        () => void,
    ];

    return [
        () => {
            const value = search().get(key);
            if (value === null || value == "") {
                return defaultValue;
            }
            return value;
        },
        (value: number | ((prev: number) => number)) => {
            const current = search();
            if (typeof value === "function") {
                value = value(parseInt(current.get(key) || defaultValue, 10));
            }
            const url = new URL(window.location.href);
            url.searchParams.set(key, value.toString());
            window.history.pushState({}, "", url.toString());
            // Update shared signal so all components react
            setSearch(new URLSearchParams(url.search));
        },
    ];
}
