import { z } from "zod";

/** Hex color like #fff or #112233 */
export const HexColor = z
    .string()
    .regex(
        /^#(?:[0-9a-fA-F]{3}){1,2}$/,
        "Expected hex color like #fff or #112233",
    )
    .describe("Hex color");

export const ContentSchema = z
    .object({
        /** Arbitrary placement identifier (e.g., "top-left", "x:10,y:20") */
        location: z.string().min(1, "location is required"),
    })
    .strict()
    .describe("Common content positioning metadata");

export const TextContentSchema = ContentSchema.extend({
    type: z.literal("text"),
    text: z.string().min(1, "text cannot be empty"),
    fontSize: z.number().positive().max(512).describe("px"),
    color: HexColor,
})
    .strict()
    .describe("Text element");

export const ImageContentSchema = ContentSchema.extend({
    type: z.literal("image"),
    imageUrl: z.string().url(),
    width: z.number().int().positive().max(10000).describe("px"),
    height: z.number().int().positive().max(10000).describe("px"),
})
    .strict()
    .describe("Image element");

/** Discriminated union on `type` for optimal narrowing & performance */
export const ElementSchema = z.discriminatedUnion("type", [
    TextContentSchema,
    ImageContentSchema,
]);

export const SlideContentSchema = z
    .object({
        elements: z.array(ElementSchema).min(1, "at least one element"),
    })
    .strict()
    .describe("Slide content container");

export const SlideFormatSchema = z
    .object({
        title: z.string().min(1),
        content: SlideContentSchema,
        backgroundColor: HexColor,
        textColor: HexColor,
    })
    .strict()
    .describe("Slide format");

/* ===== Inferred TS types ===== */
export type Content = z.infer<typeof ContentSchema>;
export type TextContent = z.infer<typeof TextContentSchema>;
export type ImageContent = z.infer<typeof ImageContentSchema>;
export type Element = z.infer<typeof ElementSchema>;
export type SlideContent = z.infer<typeof SlideContentSchema>;
export type SlideFormat = z.infer<typeof SlideFormatSchema>;

/* ===== Example usage ===== */
// const parsed = SlideFormatSchema.parse(input);
// const safe = SlideFormatSchema.safeParse(input);
