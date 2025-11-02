import type { APIRoute } from "astro";
import { getOptionalUser } from "../../lib/db";
import { redirectTo404 } from "../../lib/util";
import { SlideFormatSchema } from "../../lib/slides";
import { z } from "zod";
import { localsUser } from "../../lib/auth";

const slideSystemContent = `You are an expert presentation creator. You focus on making presentations that are engaging, informative, and visually appealing. Your task is to create a presentation based on the topic provided by the user. The presentation should at least include a title slide, an introduction slide, several content slides, and a conclusion slide (if possible). Each slide should have a clear and concise title, bullet points or short paragraphs for content, and suggestions for relevant images or graphics to enhance the visual appeal of the presentation. You will ALWAYS return a presentation, even if it doesn't meet the exact conditions of this prompt. You should return only a JSON object with two fields, 'title', which is a title and 'slices', which is an array of slide objects. Do not include anything other than the raw JSON. Do not include any block element tags. Only return a valid JSON. The slide array has objects with the following schema:
${JSON.stringify(z.toJSONSchema(SlideFormatSchema))}`;

// This creates a presentation from the topic given in the search params.
export const GET: APIRoute = async ({ request, url, locals }) => {
    const topic = url.searchParams.get("topic");
    if (!topic || topic.trim().length === 0) {
        return redirectTo404();
    }

    const [user, resp] = localsUser(locals);
    if (resp) {
        return resp;
    }

    const dbUserResp = await getOptionalUser(user.id);
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

    const slidesAsJson = JSON.parse(slides);

    let parsedSlides = z.array(SlideFormatSchema).safeParse(slidesAsJson);
    if (!parsedSlides.success) {
        console.error("Slide parsing error:", parsedSlides.error.format());
        return redirectTo404();
    }

    return new Response(JSON.stringify({ slides: parsedSlides.data }), {
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
                    role: "system",
                    content: slideSystemContent,
                },
                {
                    role: "user",
                    content: topic,
                },
            ],
        }),
    })
        .then((r) => r.json())
        .then((data) => {
            return data.choices?.[0]?.message?.content || null;
        });
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
                    role: "system",
                    content: slideSystemContent,
                },
                {
                    role: "user",
                    content: topic,
                },
            ],
        }),
    })
        .then((r) => r.json())
        .then((data) => {
            return data.choices?.[0]?.message?.content || null;
        });
};
