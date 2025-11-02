import { createSignal, type Accessor } from "solid-js";
import type { SlideFormat, Element } from "../../lib/slides";
import { createShared, PRESENTATION, useSharedSlides } from "./primitives/createShared";
import type { Presentation } from "../../lib/db";
import { createQuery } from "./primitives/createQuery";

export function SlideProperties(props: { presentation: Presentation }) {
    const [slideIndex, setSlideIndex] = createQuery("slide", "1");
    const [presentation, setPresentation, refresh] = createShared<Presentation>(
        PRESENTATION,
        props.presentation,
    );
    
    // Use shared slides to ensure consistency with other components
    const slides = useSharedSlides();
    const currentSlideIndex = () => parseInt(slideIndex(), 10) - 1;
    const currentSlide = (): SlideFormat | undefined => {
        const s = slides();
        const idx = currentSlideIndex();
        return s && idx >= 0 && idx < s.length ? s[idx] : undefined;
    };

    const [saving, setSaving] = createSignal(false);
    const [saved, setSaved] = createSignal(false);

    const updateSlide = (updates: Partial<SlideFormat>) => {
        const slidesArr = slides();
        if (!slidesArr) return;

        const idx = currentSlideIndex();
        if (idx < 0 || idx >= slidesArr.length) return;

        const updated = [...slidesArr];
        updated[idx] = { ...updated[idx], ...updates };

        const newPresentation = {
            ...presentation()!,
            slides: updated,
        };
        setPresentation(newPresentation);
        setSaved(false);
    };

    const updateElement = (elementIndex: number, updates: Partial<Element>) => {
        const slide = currentSlide();
        if (!slide) return;

        const updatedElements = [...slide.content.elements];
        updatedElements[elementIndex] = {
            ...updatedElements[elementIndex],
            ...updates,
        } as Element;

        updateSlide({
            content: {
                elements: updatedElements,
            },
        });
    };

    const addElement = (type: "text" | "image") => {
        const slide = currentSlide();
        if (!slide) return;

        const newElement: Element = type === "text"
            ? {
                type: "text",
                text: "New text",
                fontSize: 24,
                color: slide.textColor,
                location: "center",
            }
            : {
                type: "image",
                imageUrl: "https://via.placeholder.com/400x300",
                width: 400,
                height: 300,
                location: "center",
            };

        const updatedElements = [...slide.content.elements, newElement];
        updateSlide({
            content: {
                elements: updatedElements,
            },
        });
    };

    const deleteElement = (elementIndex: number) => {
        const slide = currentSlide();
        if (!slide) return;

        const updatedElements = slide.content.elements.filter((_, idx) => idx !== elementIndex);
        if (updatedElements.length === 0) {
            // Need at least one element, so add a default text element
            updatedElements.push({
                type: "text",
                text: "New text",
                fontSize: 24,
                color: slide.textColor,
                location: "center",
            });
        }

        updateSlide({
            content: {
                elements: updatedElements,
            },
        });
    };

    const savePresentation = async () => {
        setSaving(true);
        try {
            const response = await fetch(`/api/presentation/${presentation()?.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slides: slides(),
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to save");
            }

            const updated = await response.json();
            setPresentation(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            console.error("Failed to save presentation:", error);
            alert("Failed to save presentation. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const slide = () => currentSlide();

    return (
        <div class="h-full w-80 overflow-y-auto bg-bg-sidebar border-l border-border-sidebar p-6 text-bg-text">
            <div class="mb-8">
                <h2 class="text-lg font-semibold mb-6">Slide Properties</h2>
                <button
                    onClick={savePresentation}
                    disabled={saving()}
                    class={`w-full rounded-lg px-4 py-3 font-semibold transition-colors ${
                        saving()
                            ? "bg-bg-secondary-btn-link text-text-secondary-btn-link cursor-not-allowed opacity-50"
                            : saved()
                            ? "bg-green-600 hover:bg-green-700 text-white"
                            : "bg-bg-primary-btn-link text-text-primary-btn-link hover:bg-bg-primary-btn-link-hover"
                    }`}
                >
                    {saving() ? "Saving..." : saved() ? "Saved!" : "Save Presentation"}
                </button>
            </div>

            {slide() && (
                <>
                    {/* Slide-level properties */}
                    <div class="mb-8 space-y-5">
                        <div>
                            <label class="mb-2 block text-sm font-medium text-bg-text">
                                Slide Title
                            </label>
                            <input
                                type="text"
                                value={slide()!.title}
                                onInput={(e) =>
                                    updateSlide({ title: e.currentTarget.value })
                                }
                                class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                            />
                        </div>

                        <div>
                            <label class="mb-2 block text-sm font-medium text-bg-text">
                                Background Color
                            </label>
                            <input
                                type="color"
                                value={slide()!.backgroundColor}
                                onInput={(e) =>
                                    updateSlide({
                                        backgroundColor: e.currentTarget.value,
                                    })
                                }
                                class="h-10 w-full cursor-pointer rounded-lg border border-border-sidebar bg-bg-input"
                            />
                        </div>

                        <div>
                            <label class="mb-2 block text-sm font-medium text-bg-text">
                                Text Color
                            </label>
                            <input
                                type="color"
                                value={slide()!.textColor}
                                onInput={(e) =>
                                    updateSlide({ textColor: e.currentTarget.value })
                                }
                                class="h-10 w-full cursor-pointer rounded-lg border border-border-sidebar bg-bg-input"
                            />
                        </div>
                    </div>

                    {/* Element properties */}
                    <div class="space-y-6">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="text-md font-semibold text-bg-text">Slide Elements</h3>
                            <div class="flex gap-2">
                                <button
                                    onClick={() => addElement("text")}
                                    class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover px-3 py-1.5 text-xs font-medium transition-colors"
                                    title="Add text element"
                                >
                                    + Text
                                </button>
                                <button
                                    onClick={() => addElement("image")}
                                    class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover px-3 py-1.5 text-xs font-medium transition-colors"
                                    title="Add image element"
                                >
                                    + Image
                                </button>
                            </div>
                        </div>
                        {slide()!.content.elements.map((element, idx) => (
                            <div
                                class="rounded-lg border border-border-sidebar bg-bg-card p-4"
                            >
                                <div class="flex items-center justify-between mb-4">
                                    <h4 class="text-sm font-medium capitalize text-bg-text">
                                        {element.type} Element #{idx + 1}
                                    </h4>
                                    {slide()!.content.elements.length > 1 && (
                                        <button
                                            onClick={() => deleteElement(idx)}
                                            class="text-xs text-red-400 hover:text-red-300 transition-colors"
                                            title="Delete element"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>

                                {element.type === "text" && (
                                    <>
                                        <div class="mb-4">
                                            <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                Text
                                            </label>
                                            <textarea
                                                value={element.text}
                                                onInput={(e) =>
                                                    updateElement(idx, {
                                                        text: e.currentTarget.value,
                                                    })
                                                }
                                                class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                rows={3}
                                            />
                                        </div>
                                        <div class="mb-4">
                                            <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                Font Size (px)
                                            </label>
                                            <input
                                                type="number"
                                                value={element.fontSize}
                                                min="1"
                                                max="512"
                                                onInput={(e) =>
                                                    updateElement(idx, {
                                                        fontSize: parseInt(
                                                            e.currentTarget.value,
                                                            10,
                                                        ),
                                                    })
                                                }
                                                class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                            />
                                        </div>
                                        <div class="mb-4">
                                            <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                Text Color
                                            </label>
                                            <input
                                                type="color"
                                                value={element.color}
                                                onInput={(e) =>
                                                    updateElement(idx, {
                                                        color: e.currentTarget.value,
                                                    })
                                                }
                                                class="h-10 w-full cursor-pointer rounded-lg border border-border-sidebar bg-bg-input"
                                            />
                                        </div>
                                        <div>
                                            <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                Location
                                            </label>
                                            <select
                                                value={element.location}
                                                onChange={(e) =>
                                                    updateElement(idx, {
                                                        location: e.currentTarget.value,
                                                    })
                                                }
                                                class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                            >
                                                <option value="top-left">Top Left</option>
                                                <option value="top">Top Center</option>
                                                <option value="top-right">Top Right</option>
                                                <option value="center">Center</option>
                                                <option value="bottom-left">Bottom Left</option>
                                                <option value="bottom">Bottom Center</option>
                                                <option value="bottom-right">Bottom Right</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {element.type === "image" && (
                                    <>
                                        <div class="mb-4">
                                            <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                Image URL
                                            </label>
                                            <input
                                                type="url"
                                                value={element.imageUrl}
                                                onInput={(e) =>
                                                    updateElement(idx, {
                                                        imageUrl: e.currentTarget.value,
                                                    })
                                                }
                                                class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                            />
                                        </div>
                                        <div class="mb-4 grid grid-cols-2 gap-3">
                                            <div>
                                                <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                    Width (px)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={element.width}
                                                    min="1"
                                                    max="10000"
                                                    onInput={(e) =>
                                                        updateElement(idx, {
                                                            width: parseInt(
                                                                e.currentTarget.value,
                                                                10,
                                                            ),
                                                        })
                                                    }
                                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                    Height (px)
                                                </label>
                                                <input
                                                    type="number"
                                                    value={element.height}
                                                    min="1"
                                                    max="10000"
                                                    onInput={(e) =>
                                                        updateElement(idx, {
                                                            height: parseInt(
                                                                e.currentTarget.value,
                                                                10,
                                                            ),
                                                        })
                                                    }
                                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label class="mb-2 block text-xs font-medium text-bg-text opacity-70">
                                                Location
                                            </label>
                                            <select
                                                value={element.location}
                                                onChange={(e) =>
                                                    updateElement(idx, {
                                                        location: e.currentTarget.value,
                                                    })
                                                }
                                                class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                            >
                                                <option value="top-left">Top Left</option>
                                                <option value="top">Top Center</option>
                                                <option value="top-right">Top Right</option>
                                                <option value="center">Center</option>
                                                <option value="bottom-left">Bottom Left</option>
                                                <option value="bottom">Bottom Center</option>
                                                <option value="bottom-right">Bottom Right</option>
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

