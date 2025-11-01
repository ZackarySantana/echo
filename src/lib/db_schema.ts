import { drizzle } from "drizzle-orm/neon-http";
import { neon, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

import {
    boolean,
    integer,
    json,
    pgTable,
    timestamp,
    varchar,
} from "drizzle-orm/pg-core";

neonConfig.poolQueryViaFetch = true;
neonConfig.webSocketConstructor = ws;

// This is for drizzle-kit CLI compatibility.
let dbURL = process.env.DATABASE_URL ?? "";

// Astro uses Vite under the hood, so env vars are accessed differently.
if (!dbURL) {
    dbURL = import.meta.env.DATABASE_URL;
}

export const db = drizzle({ client: neon(dbURL) });

export const presentationsTable = pgTable("presentations", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    ownerId: varchar({ length: 255 }).notNull(),
    creatorId: varchar({ length: 255 }).notNull(),

    name: varchar({ length: 255 }).notNull(),
    imageLink: varchar({ length: 255 }),
    public: boolean().notNull().default(false),

    // json column for slides
    slides: json().notNull(),

    likes: integer().notNull().default(0),

    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
});

// This users table is not for authentication purposes. It stores additional information that users configure about themselves.
export const usersTable = pgTable("users", {
    id: varchar({ length: 255 }).primaryKey(),

    openRouterAPIKey: varchar({ length: 255 }),
    chatGPTAPIKey: varchar({ length: 255 }),
});
