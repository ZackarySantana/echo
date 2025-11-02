import { eq, and, or, desc } from "drizzle-orm";
import { presentationsTable, usersTable, roomsTable, db } from "./db_schema";
import { redirectTo404, type Or } from "./util";
import { sql } from "drizzle-orm";

export type Presentation = typeof presentationsTable.$inferSelect;

export const getPresentationById = async (
    user: string,
    id: string,
): Promise<Or<Presentation, Response>> => {
    const idAsInt = parseInt(id ?? "NAN", 10);
    if (isNaN(idAsInt)) {
        return [undefined, redirectTo404("Presentation not found.")];
    }

    const presentations = await db
        .select()
        .from(presentationsTable)
        .where(
            and(
                eq(presentationsTable.id, idAsInt),
                or(
                    eq(presentationsTable.public, true),
                    eq(presentationsTable.ownerId, user),
                ),
            ),
        )
        .execute();

    if (presentations.length === 0) {
        return [undefined, redirectTo404("Presentation not found.")];
    }

    return [presentations[0], undefined];
};

export const getPresentationsByUser = async (
    user: string,
): Promise<Or<Presentation[], Response>> => {
    const presentations = await db
        .select()
        .from(presentationsTable)
        .where(eq(presentationsTable.ownerId, user))
        .execute();

    return [presentations, undefined];
};

export const getPublicPresentationsByLikes = async (
    limit?: number,
): Promise<Or<Presentation[], Response>> => {
    let query = db
        .select()
        .from(presentationsTable)
        .where(eq(presentationsTable.public, true))
        .orderBy(desc(presentationsTable.likes));

    if (limit !== undefined) {
        query = query.limit(limit);
    }

    const presentations = await query.execute();
    return [presentations, undefined];
};

export type NewPresentation = typeof presentationsTable.$inferInsert;

export const insertPresentation = async (
    value: NewPresentation,
): Promise<Or<Presentation, Response>> => {
    const [inserted] = await db
        .insert(presentationsTable)
        .values(value)
        .returning()
        .execute();

    return [inserted, undefined];
};

export const updatePresentation = async (
    user: string,
    id: number,
    updates: Partial<Pick<Presentation, "name" | "slides" | "public">>,
): Promise<Or<Presentation, Response>> => {
    const idAsInt = id;
    if (isNaN(idAsInt)) {
        return [undefined, redirectTo404("Presentation not found.")];
    }

    // Check ownership first
    const [existing, existingErr] = await getPresentationById(user, id.toString());
    if (existingErr) {
        return [undefined, existingErr];
    }
    if (!existing || existing.ownerId !== user) {
        return [undefined, redirectTo404("You don't have permission to update this presentation.")];
    }

    const [updated] = await db
        .update(presentationsTable)
        .set({
            ...updates,
            updatedAt: sql`now()`,
        })
        .where(eq(presentationsTable.id, idAsInt))
        .returning()
        .execute();

    return [updated, undefined];
};

export type User = typeof usersTable.$inferSelect;

export async function getOptionalUser(
    userId: string,
): Promise<undefined | Or<User, Response>> {
    const users = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .execute();

    if (users.length === 0) {
        return undefined;
    }

    return [users[0], undefined];
}

export async function setOpenRouterAPIKey(
    userId: string,
    apiKey: string | null,
): Promise<void> {
    await db
        .insert(usersTable)
        .values({ id: userId, openRouterAPIKey: apiKey })
        .onConflictDoUpdate({
            target: usersTable.id,
            set: { openRouterAPIKey: apiKey },
        });
}

export async function setChatGPTAPIKey(
    userId: string,
    apiKey: string | null,
): Promise<void> {
    await db
        .insert(usersTable)
        .values({ id: userId, chatGPTAPIKey: apiKey })
        .onConflictDoUpdate({
            target: usersTable.id,
            set: { chatGPTAPIKey: apiKey },
        });
}

export type Room = typeof roomsTable.$inferSelect;
export type NewRoom = typeof roomsTable.$inferInsert;

// Generate a random room code
function generateRoomCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

export const createRoom = async (
    userId?: string | null,
): Promise<Or<Room, Response>> => {
    // Use "anonymous" if no user ID provided
    const creatorId = userId || "anonymous";
    const ownerId = creatorId; // Owner is the creator initially
    
    let code = generateRoomCode();
    let attempts = 0;
    const maxAttempts = 10;

    // Try to create a room with a unique code
    while (attempts < maxAttempts) {
        try {
            const [inserted] = await db
                .insert(roomsTable)
                .values({
                    code,
                    createdBy: creatorId,
                    ownerId: ownerId,
                    hidden: false,
                })
                .returning()
                .execute();

            return [inserted, undefined];
        } catch (error: any) {
            // If unique constraint violation, try a new code
            if (error?.code === "23505") {
                code = generateRoomCode();
                attempts++;
                continue;
            }
            throw error;
        }
    }

    return [undefined, redirectTo404("Failed to create room. Please try again.")];
};

export const getRoomByCode = async (
    code: string,
): Promise<Or<Room, Response>> => {
    const rooms = await db
        .select()
        .from(roomsTable)
        .where(
            and(
                eq(roomsTable.code, code.toUpperCase()),
                eq(roomsTable.hidden, false),
            ),
        )
        .execute();

    if (rooms.length === 0) {
        return [undefined, redirectTo404("Room not found.")];
    }

    return [rooms[0], undefined];
};

export const hideRoom = async (
    code: string,
): Promise<Or<Room, Response>> => {
    const rooms = await db
        .update(roomsTable)
        .set({
            hidden: true,
            updatedAt: sql`now()`,
        })
        .where(eq(roomsTable.code, code.toUpperCase()))
        .returning()
        .execute();

    if (rooms.length === 0) {
        return [undefined, redirectTo404("Room not found.")];
    }

    return [rooms[0], undefined];
};
