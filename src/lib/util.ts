export const redirectTo404 = (error?: string, warning?: string) =>
    new Response(null, {
        status: 302,
        headers: {
            Location: `/404?${error ? `error=${encodeURIComponent(error)}` : ""}${warning ? `&warning=${encodeURIComponent(warning)}` : ""}`,
        },
    });

export type Or<T, U> = [T, undefined] | [undefined, U];
