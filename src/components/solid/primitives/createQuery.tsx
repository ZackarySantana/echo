import {
    createSignal,
    onMount,
    onCleanup,
    type Accessor,
    type Setter,
} from "solid-js";

export function createQuery(
    key: string,
    defaultValue: string = "",
): [Accessor<string>, Setter<number>] {
    const [search, setSearch] = createSignal(
        new URLSearchParams(window.location.search),
    );

    const update = () => setSearch(new URLSearchParams(window.location.search));

    onMount(() => {
        window.addEventListener("popstate", update);
        window.addEventListener("hashchange", update);
        window.addEventListener("locationchange", update);
    });

    onCleanup(() => {
        window.removeEventListener("popstate", update);
        window.removeEventListener("hashchange", update);
        window.removeEventListener("locationchange", update);
    });

    return [
        () => {
            const value = search().get(key);
            if (value === null || value == "") {
                return defaultValue;
            }
            return value;
        },
        (value: number | ((prev: number) => number)) => {
            if (typeof value === "function") {
                value = value(parseInt(search().get(key) || defaultValue));
            }
            const url = new URL(window.location.href);
            url.searchParams.set(key, value.toString());
            window.history.pushState({}, "", url.toString());
            setSearch(new URLSearchParams(url.search));
        },
    ];
}
