import { z } from "zod";

/* ============================================================================
 * CORE TYPES AND CONSTANTS
 * ============================================================================ */

/**
 * Hex color like #fff or #112233
 */
export const HexColorSchema = z
    .string()
    .regex(
        /^#(?:[0-9a-fA-F]{3}){1,2}$/,
        "Expected hex color like #fff or #112233",
    )
    .describe("Hex color");

/**
 * Slide style schema - shared styling properties for slides
 * Note: Defaults match the app theme (dark mode) but can be overridden
 */
export const SlideStyleSchema = z
    .object({
        backgroundColor: HexColorSchema.default("#1a1d24").describe("Background color of the slide (defaults to app theme card color)"),
        textColor: HexColorSchema.default("#ffffff").describe("Text color for the slide (defaults to white for dark theme)"),
    })
    .strict()
    .describe("Style properties for the slide");

/**
 * Pre-determined slide formats - each has specific layout and content requirements
 */
export const SlideFormatEnumSchema = z.enum([
    "title-only",           // Just title, centered
    "title-subtitle",       // Title and subtitle, both centered
    "title-bullets",        // Title and bullet points, left aligned
    "title-paragraph",      // Title and paragraph, left aligned
    "title-2columns",       // Title and two columns of content (bullets or text)
    "title-image",          // Title and image, centered
    "comparison",           // Comparison layout with left and right sides
]).describe("Pre-determined slide format template");

/**
 * Image information - can be added to any slide
 */
export const ImageInfoSchema = z
    .object({
        description: z.string().min(1).describe("Description of what the image should show"),
        url: z.string().url().optional().describe("Optional image URL if available"),
        position: z.enum(["left", "right", "center", "full", "top", "bottom"]).describe("Image position on slide"),
        caption: z.string().optional().describe("Optional caption text for the image"),
    })
    .strict()
    .describe("Image information - can be added to any slide");

/* ============================================================================
 * POLL SYSTEM - Flexible polling with different types
 * ============================================================================ */

/**
 * Poll types that determine how votes are processed and displayed
 */
export const PollTypeSchema = z.enum([
    "accumulator",      // Simple vote counter - accumulates and displays total
    "action-trigger",   // Votes trigger actions when threshold is met (reorder, delete, etc.)
    "choice",          // Multiple choice poll with results display
    "feedback",        // Collect feedback/reviews (e.g., ratings, comments)
]).describe("Type of poll - determines vote processing behavior");

/**
 * Action types that can be triggered by polls
 */
export const PollActionTypeSchema = z.enum([
    "reorder-slides",      // Reorder slides based on vote results
    "delete-slides",       // Delete specific slides when threshold met
    "skip-slide",          // Skip to next slide
    "jump-slide",          // Jump to specific slide index
    "display-results",     // Display accumulated results on slide
    "hide-slides",         // Hide specific slides from presentation
]).describe("Action type that can be triggered when poll threshold is met");

/**
 * Action configuration - defines what happens when poll threshold is reached
 */
export const PollActionSchema = z
    .object({
        type: PollActionTypeSchema.describe("Type of action to trigger"),
        // For reorder-slides: metadata should contain { targetIndices: number[], newOrder: number[] }
        // For delete-slides: metadata should contain { slideIndices: number[] }
        // For jump-slide: metadata should contain { targetIndex: number }
        // For hide-slides: metadata should contain { slideIndices: number[] }
        metadata: z.record(z.string(), z.any()).optional().describe("Action-specific metadata"),
    })
    .strict()
    .describe("Action that triggers when poll threshold is met");

/**
 * Poll element - represents an interactive poll on the slide
 */
export const PollSchema = z
    .object({
        id: z.string().min(1).describe("Unique identifier for this poll (used by buttons)"),
        type: PollTypeSchema.default("accumulator").describe("Type of poll - determines behavior"),
        question: z.string().min(1).max(200).optional().describe("Optional poll question text"),
        
        // For action-trigger polls
        action: PollActionSchema.optional().describe("Action to trigger when threshold is met (required for action-trigger type)"),
        threshold: z.number().int().positive().max(10000).optional().describe("Number of votes needed to trigger action (for action-trigger type)"),
        
        // For accumulator polls
        displayOnSlide: z.boolean().default(false).describe("Whether to display vote count on the slide (for accumulator type)"),
        
        // General metadata
        metadata: z.record(z.string(), z.any()).optional().describe("Additional poll metadata (e.g., category, tags)"),
    })
    .strict()
    .describe("Poll element on the slide - supports multiple poll types");

/* ============================================================================
 * BUTTON SYSTEM - Buttons that interact with polls
 * ============================================================================ */

/**
 * Button action metadata - defines what the button does
 */
export const ButtonActionSchema = z
    .object({
        type: z.enum([
            "vote",              // Cast a vote for the poll
            "vote-with-value",   // Cast a vote with a specific value (e.g., rating)
        ]).describe("Type of button action"),
        value: z.union([z.string(), z.number()]).optional().describe("Optional value to submit with vote (for vote-with-value)"),
    })
    .strict()
    .describe("Action that button performs");

/**
 * Button object - separate from text for easier parsing and editing
 */
export const ButtonSchema = z
    .object({
        text: z.string().min(1).max(50).describe("Button label text"),
        pollId: z.string().min(1).describe("ID of the poll element this button is associated with"),
        action: ButtonActionSchema.optional().default({ type: "vote" }).describe("Action the button performs"),
        metadata: z.record(z.string(), z.any()).optional().describe("Additional button metadata (e.g., {option: 'yes'})"),
    })
    .strict()
    .describe("Button object - associated with a poll element");

/* ============================================================================
 * SHARED INTERACTIVE CONTENT - Common across all formats
 * ============================================================================ */

/**
 * Interactive elements that can be added to any slide format
 */
export const InteractiveContentSchema = z
    .object({
        polls: z.array(PollSchema).max(5).optional().describe("Optional array of up to 5 poll elements"),
        buttons: z.array(ButtonSchema).max(10).optional().describe("Optional array of up to 10 buttons (must reference poll IDs)"),
    })
    .strict()
    .describe("Interactive content (polls and buttons) - available on all slide formats");

/* ============================================================================
 * FORMAT-SPECIFIC CONTENT SCHEMAS
 * ============================================================================ */

/** Title-only format - just title, centered */
export const TitleOnlyContentSchema = InteractiveContentSchema.extend({
    image: ImageInfoSchema.optional().describe("Optional image"),
})
    .strict()
    .describe("Title-only format - just title (centered), optional image, polls, and buttons");

/** Title-subtitle format - title and subtitle, both centered */
export const TitleSubtitleContentSchema = InteractiveContentSchema.extend({
    subtitle: z.string().min(1).max(200).describe("Subtitle text"),
    image: ImageInfoSchema.optional().describe("Optional image"),
})
    .strict()
    .describe("Title-subtitle format - title and subtitle (both centered), optional image, polls, and buttons");

/** Title-bullets format - title and bullets, left aligned */
export const TitleBulletsContentSchema = InteractiveContentSchema.extend({
    bullets: z.array(z.string().min(1)).min(1).max(7).describe("Array of 1-7 bullet point strings"),
    image: ImageInfoSchema.optional().describe("Optional image"),
})
    .strict()
    .describe("Title-bullets format - title and bullets (left aligned), optional image, polls, and buttons");

/** Title-paragraph format - title and paragraph, left aligned */
export const TitleParagraphContentSchema = InteractiveContentSchema.extend({
    paragraph: z.string().min(1).max(500).describe("Paragraph text"),
    image: ImageInfoSchema.optional().describe("Optional image"),
})
    .strict()
    .describe("Title-paragraph format - title and paragraph (left aligned), optional image, polls, and buttons");

/** Title-2columns format - title and two columns */
export const Title2ColumnsContentSchema = InteractiveContentSchema.extend({
    leftColumn: z.string().min(1).max(300).describe("Left column content (text or bullet points)"),
    rightColumn: z.string().min(1).max(300).describe("Right column content (text or bullet points)"),
    image: ImageInfoSchema.optional().describe("Optional image"),
})
    .strict()
    .describe("Title-2columns format - title and two columns, optional image, polls, and buttons");

/** Title-image format - title and image, centered */
export const TitleImageContentSchema = InteractiveContentSchema.extend({
    image: ImageInfoSchema.describe("Required image for this format"),
})
    .strict()
    .describe("Title-image format - title and image (centered), image required, optional polls and buttons");

/** Comparison format - comparison layout */
export const ComparisonContentSchema = InteractiveContentSchema.extend({
    leftTitle: z.string().min(1).max(50).describe("Left side title"),
    leftItems: z.array(z.string().min(1)).min(1).max(5).describe("Left side items (1-5)"),
    rightTitle: z.string().min(1).max(50).describe("Right side title"),
    rightItems: z.array(z.string().min(1)).min(1).max(5).describe("Right side items (1-5)"),
    image: ImageInfoSchema.optional().describe("Optional image"),
})
    .strict()
    .describe("Comparison format - comparison layout with left and right sides, optional image, polls, and buttons");

/* ============================================================================
 * MAIN SLIDE SCHEMA - Discriminated union based on format
 * ============================================================================ */

/**
 * Discriminated union based on format - rigid structure
 * Each format determines exact layout and content structure
 */
export const SlideFormatSchema = z.discriminatedUnion("format", [
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("title-only"),
        content: TitleOnlyContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("title-subtitle"),
        content: TitleSubtitleContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("title-bullets"),
        content: TitleBulletsContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("title-paragraph"),
        content: TitleParagraphContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("title-2columns"),
        content: Title2ColumnsContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("title-image"),
        content: TitleImageContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
    z.object({
        title: z.string().min(1).max(100).describe("Slide title"),
        format: z.literal("comparison"),
        content: ComparisonContentSchema,
        style: SlideStyleSchema.optional().describe("Optional style properties"),
    }).strict(),
]).describe("Rigid slide format - format determines exact layout and content structure");

/* ============================================================================
 * TYPE EXPORTS
 * ============================================================================ */

export type HexColor = z.infer<typeof HexColorSchema>;
export type SlideStyle = z.infer<typeof SlideStyleSchema>;
export type SlideFormatEnum = z.infer<typeof SlideFormatEnumSchema>;
export type ImageInfo = z.infer<typeof ImageInfoSchema>;
export type PollType = z.infer<typeof PollTypeSchema>;
export type PollActionType = z.infer<typeof PollActionTypeSchema>;
export type PollAction = z.infer<typeof PollActionSchema>;
export type Poll = z.infer<typeof PollSchema>;
export type ButtonAction = z.infer<typeof ButtonActionSchema>;
export type Button = z.infer<typeof ButtonSchema>;
export type InteractiveContent = z.infer<typeof InteractiveContentSchema>;

export type TitleOnlyContent = z.infer<typeof TitleOnlyContentSchema>;
export type TitleSubtitleContent = z.infer<typeof TitleSubtitleContentSchema>;
export type TitleBulletsContent = z.infer<typeof TitleBulletsContentSchema>;
export type TitleParagraphContent = z.infer<typeof TitleParagraphContentSchema>;
export type Title2ColumnsContent = z.infer<typeof Title2ColumnsContentSchema>;
export type TitleImageContent = z.infer<typeof TitleImageContentSchema>;
export type ComparisonContent = z.infer<typeof ComparisonContentSchema>;

export type SlideFormat = z.infer<typeof SlideFormatSchema>;
