import { z } from "zod";

/** Hex color like #fff or #112233 */
export const HexColor = z
    .string()
    .regex(
        /^#(?:[0-9a-fA-F]{3}){1,2}$/,
        "Expected hex color like #fff or #112233",
    )
    .describe("Hex color");

/** Slide types for better AI structuring */
export const SlideTypeSchema = z.enum([
    "title",
    "content",
    "bullet",
    "image",
    "comparison",
    "conclusion",
]).describe("Type of slide to help structure the presentation");

/** Bullet point structure */
export const BulletPointSchema = z
    .object({
        text: z.string().min(1).describe("Bullet point text"),
        subPoints: z.array(z.string()).optional().describe("Optional sub-bullet points"),
    })
    .strict()
    .describe("Bullet point with optional sub-points");

/** Paragraph content */
export const ParagraphSchema = z
    .string()
    .min(1)
    .describe("Paragraph text content");

/** Image information */
export const ImageInfoSchema = z
    .object({
        description: z.string().min(1).describe("Description of what the image should show"),
        url: z.string().url().optional().describe("Optional image URL if available"),
        width: z.number().int().positive().max(10000).optional().describe("Image width in pixels"),
        height: z.number().int().positive().max(10000).optional().describe("Image height in pixels"),
        position: z.enum(["left", "right", "center", "full"]).optional().describe("Image position on slide"),
    })
    .strict()
    .describe("Image information");

/** Comparison item */
export const ComparisonItemSchema = z
    .object({
        label: z.string().min(1).describe("Label for this comparison item"),
        value: z.string().min(1).describe("Value or description"),
    })
    .strict()
    .describe("Comparison item");

/** Slide content structure - more flexible and AI-friendly */
export const Slide2ContentSchema = z
    .object({
        /** Main heading/title text for the slide */
        heading: z.string().optional().describe("Optional main heading (different from slide title)"),
        
        /** Bullet points - use for bullet slide type */
        bullets: z.array(BulletPointSchema).optional().describe("Array of bullet points"),
        
        /** Paragraphs - use for content slide type */
        paragraphs: z.array(ParagraphSchema).optional().describe("Array of paragraph texts"),
        
        /** Image information - use for image slide type */
        image: ImageInfoSchema.optional().describe("Image information"),
        
        /** Comparison data - use for comparison slide type */
        comparison: z.object({
            leftItems: z.array(ComparisonItemSchema).describe("Left side comparison items"),
            rightItems: z.array(ComparisonItemSchema).describe("Right side comparison items"),
        }).optional().describe("Comparison data for comparison slides"),
        
        /** Key takeaway or callout */
        takeaway: z.string().optional().describe("Key takeaway or important callout text"),
        
        /** Additional notes or context */
        notes: z.string().optional().describe("Additional speaker notes or context"),
    })
    .strict()
    .describe("Structured slide content");

/** Improved slide format schema for better AI generation */
export const SlideFormat2Schema = z
    .object({
        /** Slide title */
        title: z.string().min(1).describe("Slide title"),
        
        /** Type of slide */
        type: SlideTypeSchema.describe("Type of slide"),
        
        /** Slide content structure */
        content: Slide2ContentSchema.describe("Structured slide content"),
        
        /** Background color */
        backgroundColor: HexColor.default("#ffffff").describe("Slide background color"),
        
        /** Text color */
        textColor: HexColor.default("#000000").describe("Default text color"),
        
        /** Layout preference */
        layout: z.enum(["standard", "split", "centered", "full-image"]).optional().describe("Slide layout preference"),
    })
    .strict()
    .describe("Improved slide format for AI generation");

/* ===== Inferred TS types ===== */
export type SlideType = z.infer<typeof SlideTypeSchema>;
export type BulletPoint = z.infer<typeof BulletPointSchema>;
export type ImageInfo = z.infer<typeof ImageInfoSchema>;
export type ComparisonItem = z.infer<typeof ComparisonItemSchema>;
export type Slide2Content = z.infer<typeof Slide2ContentSchema>;
export type SlideFormat2 = z.infer<typeof SlideFormat2Schema>;

