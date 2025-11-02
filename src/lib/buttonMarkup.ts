/**
 * Button markup format for embedding clickable buttons in text.
 * 
 * Format: [button:text|action:value] or [button:text|metadata:{...}]
 * 
 * Examples:
 * - [button:Vote Now|action:vote]
 * - [button:Submit|metadata:{"action":"submit","id":"123"}]
 * - [button:Click Me|action:vote]
 * 
 * The button will be rendered as a clickable button with the specified text and metadata.
 */

export interface ButtonMetadata {
    action?: string;
    [key: string]: any;
}

export interface ButtonInfo {
    text: string;
    metadata: ButtonMetadata;
    startIndex: number;
    endIndex: number;
}

/**
 * Parse button markup from text string
 * Supports:
 * - [button:text|action:value] - simple action
 * - [button:text|metadata:{...}] - full metadata JSON
 */
export function parseButtons(text: string): { parts: (string | ButtonInfo)[]; buttons: ButtonInfo[] } {
    const parts: (string | ButtonInfo)[] = [];
    const buttons: ButtonInfo[] = [];
    
    // Pattern to match [button:text|action:value] or [button:text|metadata:{...}]
    const buttonPattern = /\[button:([^\|]+)\|(action|metadata):([^\]]+)\]/g;
    
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    
    while ((match = buttonPattern.exec(text)) !== null) {
        const [fullMatch, buttonText, metadataType, metadataValue] = match;
        const startIndex = match.index;
        const endIndex = startIndex + fullMatch.length;
        
        // Add text before button
        if (startIndex > lastIndex) {
            parts.push(text.substring(lastIndex, startIndex));
        }
        
        // Parse metadata
        let metadata: ButtonMetadata = {};
        if (metadataType === "action") {
            metadata = { action: metadataValue };
        } else if (metadataType === "metadata") {
            try {
                metadata = JSON.parse(metadataValue);
            } catch (e) {
                // Invalid JSON, use action fallback
                metadata = { action: metadataValue };
            }
        }
        
        const buttonInfo: ButtonInfo = {
            text: buttonText,
            metadata,
            startIndex,
            endIndex,
        };
        
        parts.push(buttonInfo);
        buttons.push(buttonInfo);
        lastIndex = endIndex;
    }
    
    // Add remaining text after last button
    if (lastIndex < text.length) {
        parts.push(text.substring(lastIndex));
    } else if (parts.length === 0) {
        // No buttons found, return entire text as single part
        parts.push(text);
    }
    
    return { parts, buttons };
}

/**
 * Remove button markup from text (for plain text display)
 */
export function stripButtons(text: string): string {
    return text.replace(/\[button:[^\|]+\|(action|metadata):[^\]]+\]/g, "");
}



