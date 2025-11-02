import type { APIRoute } from "astro";
import { optionalLocalsUser } from "../../../lib/auth";
import { generateUserJWT, getOrCreateUser } from "../../../lib/vonage";

// Generate JWT token for the current user to join Vonage conversations
export const GET: APIRoute = async ({ locals }) => {
    const user = optionalLocalsUser(locals);
    const userId =
        user?.id ||
        `anonymous-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const userName = user?.primaryEmail || user?.id || userId;

    try {
        // Ensure user exists in Vonage and get the Vonage user name/ID
        const vonageUserName = await getOrCreateUser(userId, userName);
        
        // Generate JWT token - sub must be the Vonage user name (not our app user ID)
        const token = generateUserJWT(vonageUserName, userName);

        return new Response(JSON.stringify({ token, userId: vonageUserName }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Error generating JWT:", error);
        return new Response(
            JSON.stringify({
                error: "Failed to generate token",
                details: error.message,
            }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            },
        );
    }
};
