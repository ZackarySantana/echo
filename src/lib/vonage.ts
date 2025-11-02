// Vonage Conversations API integration utilities
import { Vonage } from "@vonage/server-sdk";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import { createPrivateKey } from "crypto";

// Get environment variables - in Astro, process.env works in API routes
function getEnvVar(name: string): string {
    // Try both import.meta.env (Vite) and process.env (Node)
    let value = import.meta.env[name] || process.env[name] || "";

    // Remove quotes if present (from .env file)
    if (value && (value.startsWith('"') || value.startsWith("'"))) {
        value = value.slice(1, -1);
    }

    if (!value) {
        console.warn(`Environment variable ${name} is not set`);
    }
    return value;
}

const VONAGE_API_KEY = getEnvVar("VONAGE_API_KEY");
const VONAGE_API_SECRET = getEnvVar("VONAGE_API_SECRET");
const VONAGE_APPLICATION_ID = getEnvVar("VONAGE_APPLICATION_ID");
const VONAGE_PRIVATE_KEY = getEnvVar("VONAGE_PRIVATE_KEY");

// Validate required environment variables
if (
    !VONAGE_API_KEY ||
    !VONAGE_API_SECRET ||
    !VONAGE_APPLICATION_ID ||
    !VONAGE_PRIVATE_KEY
) {
    console.error(
        "Missing Vonage environment variables. Required: VONAGE_API_KEY, VONAGE_API_SECRET, VONAGE_APPLICATION_ID, VONAGE_PRIVATE_KEY",
    );
}

// Process private key - handle OpenSSH format by converting to PEM if needed
function processPrivateKey(key: string): string {
    let processed = key
        .replace(/\\n/g, "\n") // Handle escaped newlines
        .replace(/^['"]|['"]$/g, "") // Remove surrounding quotes if any
        .trim();

    // Check for ed25519 keys - these cannot be used for RS256 JWT signing
    if (processed.includes("BEGIN OPENSSH PRIVATE KEY")) {
        // Check if it's ed25519 by looking at the key content or trying to read it
        try {
            const privateKeyObj = createPrivateKey(processed);
            const keyType = privateKeyObj.asymmetricKeyType;

            if (keyType === "ed25519") {
                throw new Error(
                    "Ed25519 keys are not supported for Vonage JWT signing. Vonage requires RSA keys (RS256 algorithm). Please download the RSA private key from your Vonage application dashboard at https://dashboard.nexmo.com/applications",
                );
            }

            // If it's RSA, convert OpenSSH to PEM format
            const pemKey = privateKeyObj.export({
                format: "pem",
                type: "pkcs8",
            });

            return typeof pemKey === "string" ? pemKey : pemKey.toString();
        } catch (error: any) {
            if (error.message.includes("Ed25519")) {
                throw error; // Re-throw our custom error
            }
            console.error("Error converting OpenSSH key to PEM:", error);
            throw new Error(
                `Failed to convert OpenSSH private key to PEM format: ${error.message}. Please download the RSA private key from your Vonage application dashboard.`,
            );
        }
    }

    // Validate it's an RSA key (should start with BEGIN RSA PRIVATE KEY or BEGIN PRIVATE KEY)
    if (
        !processed.includes("BEGIN") ||
        (!processed.includes("RSA") && !processed.includes("PRIVATE KEY"))
    ) {
        console.warn(
            "Warning: Private key format may not be valid RSA key. Vonage requires RSA keys for JWT signing.",
        );
    }

    return processed;
}

const privateKeyProcessed = processPrivateKey(VONAGE_PRIVATE_KEY);

// Validate private key format
if (privateKeyProcessed && privateKeyProcessed.includes("BEGIN OPENSSH")) {
    console.warn(
        "Warning: OpenSSH private key format detected. Vonage requires RSA PEM format.",
    );
    console.warn("To convert: ssh-keygen -p -m PEM -f your_key_file");
    console.warn(
        "Or download the RSA private key from your Vonage application dashboard.",
    );
}

const vonage = new Vonage({
    apiKey: VONAGE_API_KEY,
    apiSecret: VONAGE_API_SECRET,
    applicationId: VONAGE_APPLICATION_ID,
    privateKey: privateKeyProcessed,
});

// Generate JWT token for a user
export function generateUserJWT(
    userId: string,
    userName: string = userId,
): string {
    if (!VONAGE_APPLICATION_ID) {
        throw new Error("VONAGE_APPLICATION_ID is not set");
    }

    if (!VONAGE_PRIVATE_KEY) {
        throw new Error("VONAGE_PRIVATE_KEY is not set");
    }

    // Parse the private key (handle both newline escaped and regular formats)
    const key = processPrivateKey(VONAGE_PRIVATE_KEY);

    const now = Math.floor(Date.now() / 1000);
    // Generate unique JWT ID
    const jti = `${userId}-${now}-${Math.random().toString(36).substr(2, 9)}`;

    const jwtPayload: JwtPayload = {
        application_id: VONAGE_APPLICATION_ID,
        sub: userId, // This must be the Vonage user name (returned from getOrCreateUser)
        iat: now,
        exp: now + 86400, // 24 hours
        jti: jti, // JWT ID - unique identifier for this token
        acl: {
            paths: {
                "/*/rtc/**": {}, // Real-time communication
                "/*/users/**": {},
                "/*/conversations/**": {},
                "/*/sessions/**": {},
                // '/*/devices/**': {},
                // '/*/image/**': {},
                // '/*/media/**': {},
                // '/*/applications/**': {},
                // '/*/push/**': {},
                // '/*/knocking/**': {},
                // '/*/legs/**': {},
            },
        },
    };

    return jwt.sign(jwtPayload, key, { algorithm: "RS256" });
}

// Create or get a user in Vonage
// Note: Vonage generates its own user IDs. We use name as a unique identifier.
// If you need to persist the mapping, store Vonage user ID in your database.
export async function getOrCreateUser(
    userId: string,
    userName: string = userId,
): Promise<string> {
    // Vonage requires both 'name' and 'displayName' when creating users
    // The 'name' must be unique and is used as the identifier
    // Use a sanitized version of userName as the name
    const sanitizedName = userName
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 100);

    // Ensure we have valid values
    // Name must not be 'me' and must not start with 'USR-'
    let finalName =
        sanitizedName ||
        `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (finalName === "me" || finalName.startsWith("USR-")) {
        finalName = `user_${finalName}`;
    }

    const finalDisplayName = (userName || sanitizedName || finalName).substring(
        0,
        255,
    ); // Max length

    try {
        // Try to create the user with minimal required fields first
        const userData: any = {
            name: finalName,
        };

        // Only add displayName if we have a value
        if (finalDisplayName && finalDisplayName !== finalName) {
            userData.displayName = finalDisplayName;
        }

        const newUser = await vonage.users.createUser(userData);

        // Return the user name (not ID) - this is what should be used as 'sub' in JWT
        // Vonage user name is the identifier, not the auto-generated ID
        return newUser.name || newUser.id || finalName;
    } catch (error: any) {
        // Extract error details - the response body might be a stream
        let errorDetails = null;
        let errorMessage = error.message || "Unknown error";

        // Try to read from response.data stream if it's a PassThrough/Readable stream
        if (
            error.response?.data &&
            typeof error.response.data === "object" &&
            error.response.data._readableState
        ) {
            try {
                const chunks: Buffer[] = [];
                const stream = error.response.data;

                // Read the stream synchronously (for await...of should work)
                for await (const chunk of stream) {
                    chunks.push(Buffer.from(chunk));
                }

                const bodyText = Buffer.concat(chunks).toString("utf-8");
                if (bodyText) {
                    errorDetails = JSON.parse(bodyText);
                }
            } catch (e) {
                // If reading fails, try other methods
                console.warn("Failed to read error response stream:", e);
            }
        }

        // Try other places for error data
        if (!errorDetails) {
            if (error.body) {
                errorDetails =
                    typeof error.body === "string"
                        ? JSON.parse(error.body)
                        : error.body;
            } else if (error.response?.body) {
                errorDetails =
                    typeof error.response.body === "string"
                        ? JSON.parse(error.response.body)
                        : error.response.body;
            } else if (error.data) {
                errorDetails = error.data;
            } else if (
                error.response?.data &&
                typeof error.response.data !== "object"
            ) {
                errorDetails =
                    typeof error.response.data === "string"
                        ? JSON.parse(error.response.data)
                        : error.response.data;
            }
        }

        // Extract error message from details
        if (errorDetails) {
            if (errorDetails.detail) {
                errorMessage = errorDetails.detail;
            } else if (errorDetails.message) {
                errorMessage = errorDetails.message;
            } else if (typeof errorDetails === "string") {
                errorMessage = errorDetails;
            }
        }

        // Check for duplicate name error (can be 400 or 422)
        const isDuplicate =
            error.status === 409 ||
            error.code === 409 ||
            error.response?.status === 409 ||
            error.response?.status === 400 ||
            errorDetails?.code === "user:error:duplicate-name" ||
            (errorMessage &&
                errorMessage.toLowerCase().includes("duplicate")) ||
            (errorMessage &&
                errorMessage.toLowerCase().includes("already exists")) ||
            (errorMessage &&
                errorMessage
                    .toLowerCase()
                    .includes("user name already exists"));

        if (isDuplicate) {
            // User already exists - this is actually OK, we can use the existing user
            console.log(
                `User ${finalName} already exists in Vonage, using existing user`,
            );
            return finalName;
        }

        // Log for other errors
        console.error("Error creating Vonage user:", {
            message: errorMessage,
            code: errorDetails?.code,
            status: error.response?.status,
            details: errorDetails,
        });

        throw new Error(`Failed to create Vonage user: ${errorMessage}`);
    }
}

// Create a conversation for a room
export async function createConversation(
    roomCode: string,
    displayName: string,
): Promise<string> {
    try {
        const conversation = await vonage.conversations.createConversation({
            name: `room-${roomCode}`,
            displayName: displayName,
        });
        return conversation.id || "";
    } catch (error: any) {
        // If conversation already exists, try to get it
        if (error.status === 409 || error.code === 409) {
            // Conversation exists, we need to list and find it
            // For now, we'll throw and handle at a higher level
            throw new Error("Conversation already exists");
        }
        throw error;
    }
}

// Get a conversation by ID
export async function getConversation(conversationId: string) {
    return await vonage.conversations.getConversation(conversationId);
}

// Get or create conversation for a room (handles race conditions)
export async function getOrCreateConversation(
    roomCode: string,
    displayName: string,
): Promise<string> {
    try {
        return await createConversation(roomCode, displayName);
    } catch (error: any) {
        if (error.message === "Conversation already exists") {
            // Try to find existing conversation by listing (or use a naming convention)
            // For now, we'll store the conversation ID in the database
            throw new Error(
                "Conversation exists - must retrieve from database",
            );
        }
        throw error;
    }
}

// Add a member to a conversation
export async function addMemberToConversation(
    conversationId: string,
    userId: string,
    state: "invited" | "joined" = "joined",
): Promise<void> {
    try {
        // The API requires user object with id or name field, and channel object
        // Use lowercase strings as per API documentation
        await vonage.conversations.createMember(conversationId, {
            user: {
                name: userId, // Use name (Vonage user name) or id if you have the user ID
            },
            state: state as any, // 'invited' or 'joined' - lowercase
            channel: {
                type: "app" as any, // Channel type: 'app', 'phone', 'sip', etc. - lowercase
            } as any,
        } as any);
    } catch (error: any) {
        // If already a member, ignore
        if (
            error.status === 409 ||
            error.code === 409 ||
            error.response?.status === 409
        ) {
            return;
        }
        throw error;
    }
}

// Remove a member from a conversation
export async function removeMemberFromConversation(
    conversationId: string,
    userId: string,
): Promise<void> {
    try {
        // First get the member ID by listing members
        let memberId: string | undefined;
        for await (const member of vonage.conversations.listAllMembers(
            conversationId,
        )) {
            const memberUserId = (member as any).userId || member.user?.id;
            if (memberUserId === userId) {
                memberId = member.id;
                break;
            }
        }
        if (memberId) {
            // Use removeMember if available, otherwise try deleteMember
            try {
                (vonage.conversations as any).removeMember(
                    conversationId,
                    memberId,
                );
            } catch {
                (vonage.conversations as any).deleteMember(
                    conversationId,
                    memberId,
                );
            }
        }
    } catch (error: any) {
        // If not a member, ignore
        if (error.status === 404 || error.code === 404) {
            return;
        }
        throw error;
    }
}

// Get all members of a conversation
export async function getConversationMembers(conversationId: string) {
    const members: any[] = [];
    for await (const member of vonage.conversations.listAllMembers(
        conversationId,
    )) {
        members.push(member);
    }
    return { _embedded: { members } };
}

// Get Vonage client instance (for advanced usage)
export function getVonageClient(): Vonage {
    return vonage;
}
