import { For } from "solid-js";
import { parseButtons, type ButtonInfo } from "../../lib/buttonMarkup";

interface Props {
    text: string;
    fontSize?: number;
    color?: string;
    scale?: number;
    onButtonClick?: (button: ButtonInfo) => void;
}

export function TextWithButtons(props: Props) {
    const { parts } = parseButtons(props.text);
    const fontSize = () => props.fontSize ?? 16;
    const scale = () => props.scale ?? 1;
    
    const handleButtonClick = (button: ButtonInfo) => {
        if (props.onButtonClick) {
            props.onButtonClick(button);
        } else {
            // Default behavior - currently does nothing but logs
            console.log("Button clicked:", button);
        }
    };
    
    return (
        <>
            <For each={parts}>
                {(part) => {
                    if (typeof part === "string") {
                        return <span>{part}</span>;
                    } else {
                        // Render button
                        const button = part as ButtonInfo;
                        return (
                            <button
                                onClick={() => handleButtonClick(button)}
                                class="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-white transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                style={{
                                    "font-size": `${fontSize() * scale()}px`,
                                    "line-height": "1.5",
                                    "margin": "0 2px",
                                    "vertical-align": "baseline",
                                }}
                                data-action={button.metadata.action}
                                data-metadata={JSON.stringify(button.metadata)}
                            >
                                {button.text}
                            </button>
                        );
                    }
                }}
            </For>
        </>
    );
}

