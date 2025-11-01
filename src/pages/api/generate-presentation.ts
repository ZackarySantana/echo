import type { APIRoute } from "astro";
import { getOptionalUser, redirectTo404 } from "../../lib/db";

// This creates a presentation from the topic given in the search params.
export const GET: APIRoute = async ({ request, url, locals }) => {
    const topic = url.searchParams.get("topic");
    if (!topic || topic.trim().length === 0) {
        return redirectTo404();
    }

    const dbUserResp = await getOptionalUser(locals.user.id);
    if (!dbUserResp) {
        return redirectTo404();
    }
    const [dbUser, dbUserError] = dbUserResp;
    if (dbUserError) {
        return dbUserError;
    }
    const validChatGPTKey =
        dbUser.chatGPTAPIKey && dbUser.chatGPTAPIKey.trim().length > 0;
    const validOpenRouterKey =
        dbUser.openRouterAPIKey && dbUser.openRouterAPIKey.trim().length > 0;

    let slides: string | null = null;
    if (validOpenRouterKey) {
        slides = await getSlidesFromOpenRouter(dbUser.openRouterAPIKey!, topic);
    } else if (validChatGPTKey) {
        slides = await getSlidesFromChatGPT(dbUser.chatGPTAPIKey!, topic);
    }

    if (!slides) {
        return redirectTo404();
    }

    return new Response(JSON.stringify({ slides }), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
        },
    });
};

const getSlidesFromOpenRouter = async (key: string, topic: string) => {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "openai/gpt-4o",
            messages: [
                {
                    role: "user",
                    content: topic,
                },
            ],
        }),
    }).then((r) => r.json());
};

const getSlidesFromChatGPT = async (key: string, topic: string) => {
    return fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: topic,
                },
            ],
        }),
    }).then((r) => r.json());
};
