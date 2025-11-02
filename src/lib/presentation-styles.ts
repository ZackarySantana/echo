/**
 * Global presentation styles that match the app theme
 * These are applied to all presentations by default
 */
export const GLOBAL_PRESENTATION_STYLES = {
    backgroundColor: "#1a1d24", // Matches --color-bg-card from global.css
    textColor: "#ffffff", // White text for good contrast on dark background
} as const;

/**
 * Get the default presentation style
 * Can be overridden by presentation-level or slide-level styles
 */
export function getDefaultPresentationStyle() {
    return GLOBAL_PRESENTATION_STYLES;
}

