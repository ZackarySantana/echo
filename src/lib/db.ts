import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import {
    boolean,
    integer,
    pgTable,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";

import { eq } from "drizzle-orm";

neonConfig.poolQueryViaFetch = true;
neonConfig.webSocketConstructor = ws;

// This is for drizzle-kit CLI compatibility.
let dbURL = process.env.DATABASE_URL ?? "";

// Astro uses Vite under the hood, so env vars are accessed differently.
if (!dbURL) {
    dbURL = import.meta.env.DATABASE_URL;
}

const sql = neon(dbURL);
export const db = drizzle({ client: sql });

export const presentationsTable = pgTable("presentations", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: varchar({ length: 255 }).notNull(),
    creatorId: varchar({ length: 255 }).notNull(),

    name: varchar({ length: 255 }).notNull(),
    imageLink: varchar({ length: 255 }),
    public: boolean().notNull().default(false),

    likes: integer().notNull().default(0),

    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
});

export type Presentation = typeof presentationsTable.$inferSelect;

export const getPresentationById = async (
    user: string,
    id: string,
): Promise<[Presentation, undefined] | [undefined, Response]> => {
    const idAsInt = parseInt(id ?? "NAN", 10);
    if (isNaN(idAsInt)) {
        return [undefined, redirectTo404()];
    }

    const presentations = await db
        .select()
        .from(presentationsTable)
        .where(eq(presentationsTable.id, idAsInt))
        .execute();

    if (presentations.length === 0) {
        return [undefined, redirectTo404()];
    }

    const presentation = presentations[0];

    if (!presentation.public && presentation.ownerId === user) {
        return [undefined, redirectTo404()];
    }

    return [presentation, undefined];
};

const redirectTo404 = () =>
    new Response(null, {
        status: 302,
        headers: { Location: "/404" },
    });
