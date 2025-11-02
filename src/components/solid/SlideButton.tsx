import type { Button, Poll } from "../../lib/slides";

interface Props {
    button: Button;
    poll?: Poll;
    scale?: number;
    onClick?: (button: Button, poll?: Poll) => void;
}

export function SlideButton(props: Props) {
    const scale = () => props.scale ?? 1;
    
    const handleClick = () => {
        if (props.onClick) {
            props.onClick(props.button, props.poll);
        } else {
            // Default behavior - currently does nothing but logs
            console.log("Button clicked:", props.button, "Poll:", props.poll);
        }
    };
    
    return (
        <button
            onClick={handleClick}
            class="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 active:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
            style={{
                "font-size": `${14 * scale()}px`,
                "line-height": "1.5",
                "margin": "4px",
            }}
            data-poll-id={props.button.pollId}
            data-metadata={JSON.stringify(props.button.metadata || {})}
        >
            {props.button.text}
        </button>
    );
}

