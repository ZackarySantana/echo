export const redirectTo404 = () =>
    new Response(null, {
        status: 302,
        headers: { Location: "/404" },
    });

export type Or<T, U> = [T, undefined] | [undefined, U];
