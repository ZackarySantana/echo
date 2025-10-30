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

export const projectsTable = pgTable("projects", {
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

export type Project = typeof projectsTable.$inferSelect;
