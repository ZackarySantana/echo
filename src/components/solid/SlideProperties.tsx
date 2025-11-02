import { createSignal, For, Show } from "solid-js";
import type { SlideFormat, SlideFormatEnum, Poll, Button, PollType, PollActionType } from "../../lib/slides";
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
        updated[idx] = { ...updated[idx], ...updates } as SlideFormat;

        const newPresentation = {
            ...presentation()!,
            slides: updated,
        };
        setPresentation(newPresentation);
        setSaved(false);
    };

    const updateContent = (contentUpdates: Partial<SlideFormat["content"]>) => {
        const slide = currentSlide();
        if (!slide) return;

        updateSlide({
            content: {
                ...slide.content,
                ...contentUpdates,
            } as SlideFormat["content"],
        });
    };

    const updateStyle = (styleUpdates: Partial<SlideFormat["style"]>) => {
        const slide = currentSlide();
        if (!slide) return;

        updateSlide({
            style: {
                ...(slide.style || {}),
                ...styleUpdates,
            },
        });
    };

    const deleteSlide = () => {
        const slidesArr = slides();
        if (!slidesArr || slidesArr.length <= 1) {
            alert("Cannot delete the last slide");
            return;
        }

        if (!confirm("Are you sure you want to delete this slide?")) {
            return;
        }

        const idx = currentSlideIndex();
        const updated = slidesArr.filter((_, i) => i !== idx);
        
        const newPresentation = {
            ...presentation()!,
            slides: updated,
        };
        setPresentation(newPresentation);
        
        // Navigate to a different slide if we deleted the current one
        if (idx >= updated.length) {
            setSlideIndex((updated.length).toString());
        } else {
            setSlideIndex((idx + 1).toString());
        }
        setSaved(false);
    };

    const duplicateSlide = () => {
        const slidesArr = slides();
        if (!slidesArr) return;

        const idx = currentSlideIndex();
        const slide = currentSlide();
        if (!slide) return;

        const updated = [...slidesArr];
        const duplicated = { ...slide, title: `${slide.title} (Copy)` };
        updated.splice(idx + 1, 0, duplicated);

        const newPresentation = {
            ...presentation()!,
            slides: updated,
        };
        setPresentation(newPresentation);
        setSlideIndex((idx + 2).toString());
        setSaved(false);
    };

    const addSlide = () => {
        const slidesArr = slides();
        if (!slidesArr) return;

        const newSlide: SlideFormat = {
            title: "New Slide",
            format: "title-only",
            content: {
                polls: [],
                buttons: [],
            },
        };

        const updated = [...slidesArr, newSlide];
        const newPresentation = {
            ...presentation()!,
            slides: updated,
        };
        setPresentation(newPresentation);
        setSlideIndex((updated.length).toString());
        setSaved(false);
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
            <div class="mb-8 space-y-3">
                <h2 class="text-lg font-semibold">Slide Properties</h2>
                
                {/* Save button */}
                <button
                    onClick={savePresentation}
                    disabled={saving()}
                    class={`w-full rounded-lg px-4 py-3 font-semibold transition-colors ${
                        saving()
                            ? "bg-bg-secondary-btn-link text-text-secondary-btn-link cursor-not-allowed opacity-50"
                            : saved()
                            ? "bg-green-600 hover:bg-green-700 text-white cursor-pointer"
                            : "bg-bg-primary-btn-link text-text-primary-btn-link hover:bg-bg-primary-btn-link-hover cursor-pointer"
                    }`}
                >
                    {saving() ? "Saving..." : saved() ? "Saved!" : "Save Presentation"}
                </button>

                {/* Slide management buttons */}
                <div class="grid grid-cols-2 gap-2">
                    <button
                        onClick={addSlide}
                        class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                    >
                        + Add Slide
                    </button>
                    <button
                        onClick={duplicateSlide}
                        disabled={!slide()}
                        class="rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                    >
                        Duplicate
                    </button>
                </div>
                
                <button
                    onClick={deleteSlide}
                    disabled={!slide() || (slides()?.length || 0) <= 1}
                    class="w-full rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium text-white transition-colors cursor-pointer"
                >
                    Delete Slide
                </button>
            </div>

            <Show when={slide()}>
                {(s) => (
                    <>
                        {/* Slide Title */}
                        <div class="mb-6 space-y-5">
                            <div>
                                <label class="mb-2 block text-sm font-medium text-bg-text">
                                    Slide Title
                                </label>
                                <input
                                    type="text"
                                    value={s().title}
                                    onInput={(e) =>
                                        updateSlide({ title: e.currentTarget.value })
                                    }
                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                />
                            </div>

                            {/* Slide Format */}
                            <div>
                                <label class="mb-2 block text-sm font-medium text-bg-text">
                                    Slide Format
                                </label>
                                <select
                                    value={s().format}
                                    onChange={(e) => {
                                        const newFormat = e.currentTarget.value as SlideFormatEnum;
                                        // Don't change format if it's the same
                                        if (newFormat === s().format) return;
                                        
                                        if (!confirm("Changing format will reset the slide content. Continue?")) {
                                            return;
                                        }

                                        // Create new content based on format
                                        let newContent: SlideFormat["content"];
                                        switch (newFormat) {
                                            case "title-only":
                                                newContent = { polls: [], buttons: [] };
                                                break;
                                            case "title-subtitle":
                                                newContent = { subtitle: "Subtitle", polls: [], buttons: [] };
                                                break;
                                            case "title-bullets":
                                                newContent = { bullets: ["Bullet point 1"], polls: [], buttons: [] };
                                                break;
                                            case "title-paragraph":
                                                newContent = { paragraph: "Enter your paragraph text here.", polls: [], buttons: [] };
                                                break;
                                            case "title-2columns":
                                                newContent = { leftColumn: "Left column", rightColumn: "Right column", polls: [], buttons: [] };
                                                break;
                                            case "title-image":
                                                newContent = { 
                                                    image: { description: "Image description", position: "center" },
                                                    polls: [],
                                                    buttons: []
                                                };
                                                break;
                                            case "comparison":
                                                newContent = { 
                                                    leftTitle: "Left", 
                                                    leftItems: ["Item 1"],
                                                    rightTitle: "Right",
                                                    rightItems: ["Item 1"],
                                                    polls: [],
                                                    buttons: []
                                                };
                                                break;
                                        }

                                        updateSlide({
                                            format: newFormat,
                                            content: newContent,
                                        });
                                    }}
                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                >
                                    <option value="title-only">Title Only</option>
                                    <option value="title-subtitle">Title + Subtitle</option>
                                    <option value="title-bullets">Title + Bullets</option>
                                    <option value="title-paragraph">Title + Paragraph</option>
                                    <option value="title-2columns">Title + 2 Columns</option>
                                    <option value="title-image">Title + Image</option>
                                    <option value="comparison">Comparison</option>
                                </select>
                            </div>

                            {/* Style Properties */}
                            <div>
                                <label class="mb-2 block text-sm font-medium text-bg-text">
                                    Background Color
                                </label>
                                <input
                                    type="color"
                                    value={s().style?.backgroundColor || "#1a1d24"}
                                    onInput={(e) =>
                                        updateStyle({ backgroundColor: e.currentTarget.value })
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
                                    value={s().style?.textColor || "#ffffff"}
                                    onInput={(e) =>
                                        updateStyle({ textColor: e.currentTarget.value })
                                    }
                                    class="h-10 w-full cursor-pointer rounded-lg border border-border-sidebar bg-bg-input"
                                />
                            </div>
                        </div>

                        {/* Format-specific content editing */}
                        <div class="mb-6 space-y-5">
                            <h3 class="text-md font-semibold text-bg-text">Content</h3>

                            <Show when={s().format === "title-subtitle"}>
                                <div>
                                    <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                        Subtitle
                                    </label>
                                    <input
                                        type="text"
                                        value={s().content.subtitle}
                                        onInput={(e) =>
                                            updateContent({ subtitle: e.currentTarget.value })
                                        }
                                        class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                    />
                                </div>
                            </Show>

                            <Show when={s().format === "title-bullets"}>
                                <div>
                                    <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                        Bullet Points
                                    </label>
                                    <For each={s().content.bullets}>
                                        {(bullet, i) => (
                                            <div class="mb-2 flex gap-2">
                                                <input
                                                    type="text"
                                                    value={bullet}
                                                    onInput={(e) => {
                                                        const bullets = [...s().content.bullets];
                                                        bullets[i()] = e.currentTarget.value;
                                                        updateContent({ bullets });
                                                    }}
                                                    class="flex-1 rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const bullets = s().content.bullets.filter((_, idx) => idx !== i());
                                                        if (bullets.length === 0) bullets.push("");
                                                        updateContent({ bullets });
                                                    }}
                                                    class="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-sm text-white transition-colors cursor-pointer"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}
                                    </For>
                                    <button
                                        onClick={() => {
                                            if (s().content.bullets.length < 7) {
                                                updateContent({ bullets: [...s().content.bullets, ""] });
                                            }
                                        }}
                                        disabled={s().content.bullets.length >= 7}
                                        class="mt-2 rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                                    >
                                        + Add Bullet
                                    </button>
                                </div>
                            </Show>

                            <Show when={s().format === "title-paragraph"}>
                                <div>
                                    <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                        Paragraph
                                    </label>
                                    <textarea
                                        value={s().content.paragraph}
                                        onInput={(e) =>
                                            updateContent({ paragraph: e.currentTarget.value })
                                        }
                                        class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        rows={6}
                                    />
                                </div>
                            </Show>

                            <Show when={s().format === "title-2columns"}>
                                <div class="space-y-3">
                                    <div>
                                        <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                            Left Column
                                        </label>
                                        <textarea
                                            value={s().content.leftColumn}
                                            onInput={(e) =>
                                                updateContent({ leftColumn: e.currentTarget.value })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                            rows={4}
                                        />
                                    </div>
                                    <div>
                                        <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                            Right Column
                                        </label>
                                        <textarea
                                            value={s().content.rightColumn}
                                            onInput={(e) =>
                                                updateContent({ rightColumn: e.currentTarget.value })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                            rows={4}
                                        />
                                    </div>
                                </div>
                            </Show>

                            <Show when={s().format === "comparison"}>
                                <div class="space-y-3">
                                    <div>
                                        <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                            Left Title
                                        </label>
                                        <input
                                            type="text"
                                            value={s().content.leftTitle}
                                            onInput={(e) =>
                                                updateContent({ leftTitle: e.currentTarget.value })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                            Left Items
                                        </label>
                                        <For each={s().content.leftItems}>
                                            {(item, i) => (
                                                <div class="mb-2 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onInput={(e) => {
                                                            const items = [...s().content.leftItems];
                                                            items[i()] = e.currentTarget.value;
                                                            updateContent({ leftItems: items });
                                                        }}
                                                        class="flex-1 rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const items = s().content.leftItems.filter((_, idx) => idx !== i());
                                                            if (items.length === 0) items.push("");
                                                            updateContent({ leftItems: items });
                                                        }}
                                                        class="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-sm text-white transition-colors cursor-pointer"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            )}
                                        </For>
                                        <button
                                            onClick={() => {
                                                if (s().content.leftItems.length < 5) {
                                                    updateContent({ leftItems: [...s().content.leftItems, ""] });
                                                }
                                            }}
                                            disabled={s().content.leftItems.length >= 5}
                                            class="mt-2 rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                                        >
                                            + Add Left Item
                                        </button>
                                    </div>
                                    <div>
                                        <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                            Right Title
                                        </label>
                                        <input
                                            type="text"
                                            value={s().content.rightTitle}
                                            onInput={(e) =>
                                                updateContent({ rightTitle: e.currentTarget.value })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                            Right Items
                                        </label>
                                        <For each={s().content.rightItems}>
                                            {(item, i) => (
                                                <div class="mb-2 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onInput={(e) => {
                                                            const items = [...s().content.rightItems];
                                                            items[i()] = e.currentTarget.value;
                                                            updateContent({ rightItems: items });
                                                        }}
                                                        class="flex-1 rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const items = s().content.rightItems.filter((_, idx) => idx !== i());
                                                            if (items.length === 0) items.push("");
                                                            updateContent({ rightItems: items });
                                                        }}
                                                        class="rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-sm text-white transition-colors cursor-pointer"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            )}
                                        </For>
                                        <button
                                            onClick={() => {
                                                if (s().content.rightItems.length < 5) {
                                                    updateContent({ rightItems: [...s().content.rightItems, ""] });
                                                }
                                            }}
                                            disabled={s().content.rightItems.length >= 5}
                                            class="mt-2 rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                                        >
                                            + Add Right Item
                                        </button>
                                    </div>
                                </div>
                            </Show>

                            {/* Image editing (for formats that support it) */}
                            <Show when={
                                s().format === "title-only" || 
                                s().format === "title-subtitle" || 
                                s().format === "title-bullets" || 
                                s().format === "title-paragraph" || 
                                s().format === "title-2columns" || 
                                s().format === "comparison"
                            }>
                                <div>
                                    <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                        Image (Optional)
                                    </label>
                                    <Show when={s().content.image}>
                                        {(img) => (
                                            <div class="space-y-2">
                                                <input
                                                    type="text"
                                                    placeholder="Image description"
                                                    value={img().description}
                                                    onInput={(e) =>
                                                        updateContent({ 
                                                            image: { 
                                                                ...img(), 
                                                                description: e.currentTarget.value 
                                                            } 
                                                        })
                                                    }
                                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                />
                                                <input
                                                    type="url"
                                                    placeholder="Image URL (optional)"
                                                    value={img().url || ""}
                                                    onInput={(e) =>
                                                        updateContent({ 
                                                            image: { 
                                                                ...img(), 
                                                                url: e.currentTarget.value || undefined 
                                                            } 
                                                        })
                                                    }
                                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                />
                                                <select
                                                    value={img().position}
                                                    onChange={(e) =>
                                                        updateContent({ 
                                                            image: { 
                                                                ...img(), 
                                                                position: e.currentTarget.value as any
                                                            } 
                                                        })
                                                    }
                                                    class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                                >
                                                    <option value="left">Left</option>
                                                    <option value="right">Right</option>
                                                    <option value="center">Center</option>
                                                    <option value="full">Full</option>
                                                    <option value="top">Top</option>
                                                    <option value="bottom">Bottom</option>
                                                </select>
                                                <button
                                                    onClick={() => updateContent({ image: undefined })}
                                                    class="w-full rounded-lg bg-red-600 hover:bg-red-700 px-3 py-2 text-sm text-white transition-colors cursor-pointer"
                                                >
                                                    Remove Image
                                                </button>
                                            </div>
                                        )}
                                    </Show>
                                    <Show when={!s().content.image}>
                                        <button
                                            onClick={() => updateContent({ 
                                                image: { 
                                                    description: "Image description", 
                                                    position: "center" 
                                                } 
                                            })}
                                            class="w-full rounded-lg bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover px-3 py-2 text-sm font-medium transition-colors cursor-pointer"
                                        >
                                            + Add Image
                                        </button>
                                    </Show>
                                </div>
                            </Show>

                            {/* Image editing for title-image format (required) */}
                            <Show when={s().format === "title-image"}>
                                <div>
                                    <label class="mb-2 block text-sm font-medium text-bg-text opacity-70">
                                        Image (Required)
                                    </label>
                                    <div class="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Image description"
                                            value={s().content.image.description}
                                            onInput={(e) =>
                                                updateContent({ 
                                                    image: { 
                                                        ...s().content.image, 
                                                        description: e.currentTarget.value 
                                                    } 
                                                })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        />
                                        <input
                                            type="url"
                                            placeholder="Image URL (optional)"
                                            value={s().content.image.url || ""}
                                            onInput={(e) =>
                                                updateContent({ 
                                                    image: { 
                                                        ...s().content.image, 
                                                        url: e.currentTarget.value || undefined 
                                                    } 
                                                })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        />
                                        <select
                                            value={s().content.image.position}
                                            onChange={(e) =>
                                                updateContent({ 
                                                    image: { 
                                                        ...s().content.image, 
                                                        position: e.currentTarget.value as any
                                                    } 
                                                })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        >
                                            <option value="left">Left</option>
                                            <option value="right">Right</option>
                                            <option value="center">Center</option>
                                            <option value="full">Full</option>
                                            <option value="top">Top</option>
                                            <option value="bottom">Bottom</option>
                                        </select>
                                        <input
                                            type="text"
                                            placeholder="Image caption (optional)"
                                            value={s().content.image.caption || ""}
                                            onInput={(e) =>
                                                updateContent({ 
                                                    image: { 
                                                        ...s().content.image, 
                                                        caption: e.currentTarget.value || undefined 
                                                    } 
                                                })
                                            }
                                            class="w-full rounded-lg border border-border-sidebar bg-bg-input px-3 py-2 text-sm text-bg-text focus:border-bg-primary-btn-link focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </Show>
                        </div>
                    </>
                )}
            </Show>
        </div>
    );
}
