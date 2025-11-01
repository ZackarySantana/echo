import { eq, and, or } from "drizzle-orm";
import { presentationsTable, usersTable, db } from "./db_schema";

export type Presentation = typeof presentationsTable.$inferSelect;

export const getPresentationById = async (
    user: string,
    id: string,
): Promise<Or<Presentation, Response>> => {
    const idAsInt = parseInt(id ?? "NAN", 10);
    if (isNaN(idAsInt)) {
        return [undefined, redirectTo404()];
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
        return [undefined, redirectTo404()];
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
    apiKey: string,
): Promise<void> {
    await db
        .insert(usersTable)
        .values({ id: userId, openRouterAPIKey: apiKey })
        .onConflictDoUpdate({
            target: usersTable.id,
            set: { openRouterAPIKey: apiKey },
        });
}

type Or<T, U> = [T, undefined] | [undefined, U];

const redirectTo404 = () =>
    new Response(null, {
        status: 302,
        headers: { Location: "/404" },
    });
