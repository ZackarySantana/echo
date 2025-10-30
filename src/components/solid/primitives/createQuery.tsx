import { createSignal, onMount, onCleanup, type Accessor } from "solid-js";

export function createQuery(
    key: string,
    defaultValue: string = "",
): Accessor<string> {
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

    return () => {
        const value = search().get(key);
        if (value === null || value == "") {
            return defaultValue;
        }
        return value;
    };
}
