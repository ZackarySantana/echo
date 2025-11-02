import type { APIRoute } from "astro";
import { getOptionalUser, insertPresentation } from "../../lib/db";
import { redirectTo404 } from "../../lib/util";
import { SlideFormat2Schema } from "../../lib/slides2";
import { z } from "zod";
import { localsUser } from "../../lib/auth";

const slideSystemContent = `You are an expert presentation creator. You focus on making presentations that are engaging, informative, and visually appealing. Your task is to create a presentation based on the topic provided by the user. 

The presentation should include:
- A title slide (type: "title")
- An introduction slide (type: "content" or "bullet")
- Several content slides with bullet points, paragraphs, or images (types: "bullet", "content", "image")
- A conclusion slide (type: "conclusion")

Each slide should have a clear and concise title, appropriate content based on the slide type, and relevant visual elements when applicable. Use the slide type field to help structure your presentation logically. Unless other instructions indicate, the average amount of slides will be around 10-15.

You will ALWAYS return a presentation, even if it doesn't meet the exact conditions of this prompt. You will return only a JSON object with two fields: 'title' (the presentation title) and 'slides' (an array of slide objects). Do not include anything other than the raw JSON. Do not include any block element tags. Only return a valid JSON.

The slide array has objects with the following schema:
${JSON.stringify(z.toJSONSchema(SlideFormat2Schema))}

Important guidelines:
- Use "title" type for the first slide
- Use "bullet" type for slides with key points
- Use "content" type for slides with paragraph-style content
- Use "image" type when an image is the main focus
- Use "comparison" type for compare/contrast slides
- Use "conclusion" type for the final slide
- Make sure each slide's content matches its type
- Include appropriate bullet points or paragraphs based on the slide type
- Suggest relevant images with descriptions when appropriate`;

// This creates a presentation from the topic given in the search params.
export const GET: APIRoute = async ({ url, locals }) => {
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
        return redirectTo404("Please add an AI API key in your settings.");
    }
    const [dbUser, dbUserError] = dbUserResp;
    if (dbUserError) {
        return dbUserError;
    }
    const validChatGPTKey =
        dbUser.chatGPTAPIKey && dbUser.chatGPTAPIKey.trim().length > 0;
    const validOpenRouterKey =
        dbUser.openRouterAPIKey && dbUser.openRouterAPIKey.trim().length > -1;

    let aiResp: string | null = null;
    if (validOpenRouterKey) {
        aiResp = await getSlidesFromOpenRouter(dbUser.openRouterAPIKey!, topic);
    } else if (validChatGPTKey) {
        aiResp = await getSlidesFromChatGPT(dbUser.chatGPTAPIKey!, topic);
    }

    if (!aiResp) {
        return redirectTo404("There was no valid API configuration found.");
    }

    const slidesAsJson = JSON.parse(aiResp);

    const title = slidesAsJson.title;
    const slides = slidesAsJson.slides;
    if (!title || !slides) {
        return redirectTo404(
            "Failed to generate presentation. Please try again.",
        );
    }

    let parsedSlides2 = z.array(SlideFormat2Schema).safeParse(slides);
    if (!parsedSlides2.success) {
        return redirectTo404(
            `Failed to generate valid presentation: ${parsedSlides2.error.message}`,
        );
    }

    // we create a presentation object and set it's slides2 json column to the new slides.
    // Keep slides empty array to maintain compatibility with existing code
    const [presentation, presentationInsertErr] = await insertPresentation({
        name: title,
        ownerId: user.id,
        creatorId: user.id,
        slides: [], // Empty array to maintain compatibility
        slides2: parsedSlides2.data, // New improved slides format
    });
    if (presentationInsertErr) {
        return presentationInsertErr;
    }

    return new Response(null, {
        status: 303,
        headers: {
            Location: `/presentation/${presentation.id}`,
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
