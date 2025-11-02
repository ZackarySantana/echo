import type { APIRoute } from "astro";
import { getOptionalUser, insertPresentation } from "../../lib/db";
import { redirectTo404 } from "../../lib/util";
import { SlideFormatSchema } from "../../lib/slides";
import { z } from "zod";
import { localsUser } from "../../lib/auth";
import { db } from "../../lib/db_schema";

const slideSystemContent = `You are an expert presentation creator. You focus on making presentations that are engaging, informative, and visually appealing. Your task is to create a presentation based on the topic provided by the user.

CRITICAL RULES - FOLLOW EXACTLY:
1. Each slide uses a PRE-DETERMINED FORMAT template that MUST be followed exactly
2. Optional style field: { backgroundColor?: "#ffffff" (hex color), textColor?: "#000000" (hex color) }
3. Images can be added to ANY slide (except title-image format where it's required)
4. The content structure MUST match the chosen format exactly
5. Buttons are separate objects in the "buttons" array field - NOT embedded in text

PRE-DETERMINED SLIDE FORMATS:
1. "title-only" - Just the title, centered. Content: { image?: { description, url?, position, caption? } }
2. "title-subtitle" - Title and subtitle, both centered. Content: { subtitle (required), image?: { description, url?, position, caption? } }
3. "title-bullets" - Title and bullet points, left aligned. Content: { bullets: string[] (1-7 items, required), image?: { description, url?, position, caption? } }
4. "title-paragraph" - Title and paragraph, left aligned. Content: { paragraph: string (required, max 500 chars), image?: { description, url?, position, caption? } }
5. "title-2columns" - Title and two columns of content. Content: { leftColumn: string (required, max 300 chars), rightColumn: string (required, max 300 chars), image?: { description, url?, position, caption? } }
6. "title-image" - Title and image, centered. Content: { image: { description, url?, position, caption? } (REQUIRED) }
7. "comparison" - Comparison layout with left and right sides. Content: { leftTitle, leftItems[] (1-5 items), rightTitle, rightItems[] (1-5 items), image?: { description, url?, position, caption? } }

IMAGE POSITION OPTIONS: "left", "right", "center", "full", "top", "bottom"

POLLS AND BUTTONS (Interactive Features):
- Polls are elements defined in the "polls" array field (optional, up to 5 polls per slide).
  
  Poll Structure:
  {
    id: string (required, unique identifier - used by buttons to reference this poll),
    type?: "accumulator" | "action-trigger" | "choice" | "feedback" (default: "accumulator"),
    question?: string (optional question text, max 200 chars),
    action?: { type: PollActionType, metadata?: object } (required for action-trigger type),
    threshold?: number (required for action-trigger type - number of votes needed),
    displayOnSlide?: boolean (default: false - whether to display vote count on slide),
    metadata?: object (optional additional metadata)
  }
  
  Poll Types:
  1. "accumulator" - Simple vote counter, accumulates and displays total votes
  2. "action-trigger" - Triggers actions when threshold is met (e.g., reorder/delete slides)
  3. "choice" - Multiple choice poll with results display
  4. "feedback" - Collect feedback/reviews (ratings, comments)
  
- Buttons are in the "buttons" array field (optional, up to 10 buttons per slide).
  Each button MUST reference a poll: {
    text: string (button label, max 50 chars),
    pollId: string (must match a poll ID),
    action?: { type: "vote" | "vote-with-value", value?: string | number } (default: {type: "vote"}),
    metadata?: object (optional, e.g., {option: "yes"})
  }
  
- Multiple buttons can reference the same poll (e.g., Yes/No buttons both reference poll "q1")
  
Examples:
- Simple accumulator poll:
  polls: [{id: "vote1", type: "accumulator", question: "Do you agree?", displayOnSlide: true}]
  buttons: [{text: "Yes", pollId: "vote1"}, {text: "No", pollId: "vote1"}]

- Action-trigger poll (skip slide when threshold met):
  polls: [{
    id: "skip-poll", 
    type: "action-trigger", 
    question: "Skip this section?",
    threshold: 5,
    action: { type: "skip-slide" }
  }]
  buttons: [{text: "Skip", pollId: "skip-poll"}]

The presentation should include:
- A title slide using "title-only" or "title-subtitle" format
- Content slides using appropriate formats (mostly "title-bullets" and "title-paragraph")
- Optionally "title-image" slides when images are the main focus
- Optionally "comparison" slides for compare/contrast content
- Optionally "title-2columns" for side-by-side content
- A conclusion slide using "title-paragraph" or "title-bullets"

Unless other instructions indicate, create 10-15 slides total. You will ALWAYS return a presentation. Return only a JSON object with two fields: 'title' (the presentation title) and 'slides' (an array of slide objects). Do not include anything other than the raw JSON. Do NOT INCLUDE ANY BLOCK MARKDOWN FORMATTING.

The slide array has objects with the following schema:
${JSON.stringify(z.toJSONSchema(SlideFormatSchema))}

FORMAT-SPECIFIC REQUIREMENTS:
Note: polls? and buttons? are available in ALL formats. Images are optional on all formats except "title-image".

- "title-only": content = { image?, polls?, buttons? }
- "title-subtitle": content = { subtitle (required), image?, polls?, buttons? }
- "title-bullets": content = { bullets: string[] (1-7, required), image?, polls?, buttons? }
- "title-paragraph": content = { paragraph: string (required, max 500), image?, polls?, buttons? }
- "title-2columns": content = { leftColumn (required, max 300), rightColumn (required, max 300), image?, polls?, buttons? }
- "title-image": content = { image (required), polls?, buttons? }
- "comparison": content = { leftTitle, leftItems[] (1-5), rightTitle, rightItems[] (1-5), image?, polls?, buttons? }

IMPORTANT RULES:
- All buttons must reference a poll ID that exists in the polls array. Multiple buttons can reference the same poll.
- Optional style field: slides can include style: { backgroundColor?: "#ffffff", textColor?: "#000000" } for custom colors.
- Each format has exactly one allowed content structure.
- Polls are optional (max 5 per slide) with support for interactive voting features.
- Buttons are optional (max 10 per slide) and must reference a poll ID.
- Use "accumulator" poll type for simple vote counting, "action-trigger" for slide management features.`;

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

    let parsedSlides = z.array(SlideFormatSchema).safeParse(slides);
    if (!parsedSlides.success) {
        return redirectTo404(
            `Failed to generate valid presentation: ${parsedSlides.error.message}`,
        );
    }

    // we create a presentation object and set it's slides json column to the new slides.
    const [presentation, presentationInsertErr] = await insertPresentation({
        name: title,
        ownerId: user.id,
        creatorId: user.id,
        slides: parsedSlides.data,
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
