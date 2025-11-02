import { createSignal, For, Show } from "solid-js";
import type {
    SlideFormat,
    SlideFormatEnum,
    Poll,
    Button,
    PollType,
    PollActionType,
} from "../../lib/slides";
import {
    createShared,
    PRESENTATION,
    useSharedSlides,
} from "./primitives/createShared";
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
            } as SlideFormat["style"],
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
            setSlideIndex(updated.length);
        } else {
            setSlideIndex(idx + 1);
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
        setSlideIndex(idx + 2);
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
        setSlideIndex(updated.length);
        setSaved(false);
    };

    const updatePresentationProperty = (updates: Partial<Presentation>) => {
        const pres = presentation();
        if (!pres) return;

        const newPresentation = {
            ...pres,
            ...updates,
        };
        setPresentation(newPresentation);
        setSaved(false);
    };

    const savePresentation = async () => {
        setSaving(true);
        try {
            const pres = presentation();
            const response = await fetch(`/api/presentation/${pres?.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    slides: slides(),
                    public: pres?.public,
                    name: pres?.name,
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
        <div
            class="bg-bg-sidebar border-border-sidebar text-bg-text hidden h-full w-80 overflow-x-hidden overflow-y-auto border-l p-6 sm:block"
            style="height: 100%;"
        >
            <div class="mb-8 space-y-3">
                <h2 class="text-lg font-semibold">Presentation Settings</h2>

                {/* Presentation Name */}
                <div>
                    <label class="text-bg-text mb-2 block text-sm font-medium">
                        Presentation Name
                    </label>
                    <input
                        type="text"
                        value={presentation()?.name || ""}
                        onInput={(e) =>
                            updatePresentationProperty({
                                name: e.currentTarget.value,
                            })
                        }
                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                    />
                </div>

                {/* Public Toggle */}
                <div class="border-border-sidebar bg-bg-card flex items-center justify-between rounded-lg border p-3">
                    <div>
                        <label class="text-bg-text text-sm font-medium">
                            Make Public
                        </label>
                        <p class="mt-0.5 text-xs text-gray-500">
                            Allow others to view this presentation
                        </p>
                    </div>
                    <label class="relative inline-flex cursor-pointer items-center">
                        <input
                            type="checkbox"
                            checked={presentation()?.public || false}
                            onChange={(e) =>
                                updatePresentationProperty({
                                    public: e.currentTarget.checked,
                                })
                            }
                            class="peer sr-only"
                        />
                        <div class="peer h-6 w-11 rounded-full bg-gray-700 peer-checked:bg-blue-600 peer-focus:ring-2 peer-focus:ring-blue-500 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                    </label>
                </div>

                {/* Save button */}
                <button
                    onClick={savePresentation}
                    disabled={saving()}
                    class={`w-full rounded-lg px-4 py-3 font-semibold transition-colors ${
                        saving()
                            ? "bg-bg-secondary-btn-link text-text-secondary-btn-link cursor-not-allowed opacity-50"
                            : saved()
                              ? "cursor-pointer bg-green-600 text-white hover:bg-green-700"
                              : "bg-bg-primary-btn-link text-text-primary-btn-link hover:bg-bg-primary-btn-link-hover cursor-pointer"
                    }`}
                >
                    {saving()
                        ? "Saving..."
                        : saved()
                          ? "Saved!"
                          : "Save Presentation"}
                </button>

                {/* Slide management buttons */}
                <div class="grid grid-cols-2 gap-2">
                    <button
                        onClick={addSlide}
                        class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                    >
                        + Add Slide
                    </button>
                    <button
                        onClick={duplicateSlide}
                        disabled={!slide()}
                        class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Duplicate
                    </button>
                </div>

                <button
                    onClick={deleteSlide}
                    disabled={!slide() || (slides()?.length || 0) <= 1}
                    class="w-full cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Delete Slide
                </button>
            </div>

            <div class="mb-8">
                <h2 class="mb-4 text-lg font-semibold">Slide Properties</h2>
            </div>

            <Show when={slide()}>
                {(s) => (
                    <>
                        {/* Slide Title */}
                        <div class="mb-6 space-y-5">
                            <div>
                                <label class="text-bg-text mb-2 block text-sm font-medium">
                                    Slide Title
                                </label>
                                <input
                                    type="text"
                                    value={s().title}
                                    onInput={(e) =>
                                        updateSlide({
                                            title: e.currentTarget.value,
                                        })
                                    }
                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 focus:outline-none"
                                />
                            </div>

                            {/* Slide Format */}
                            <div>
                                <label class="text-bg-text mb-2 block text-sm font-medium">
                                    Slide Format
                                </label>
                                <select
                                    value={s().format}
                                    onChange={(e) => {
                                        const newFormat = e.currentTarget
                                            .value as SlideFormatEnum;
                                        // Don't change format if it's the same
                                        if (newFormat === s().format) return;

                                        if (
                                            !confirm(
                                                "Changing format will reset the slide content. Continue?",
                                            )
                                        ) {
                                            return;
                                        }

                                        // Create new content based on format
                                        let newContent: SlideFormat["content"];
                                        switch (newFormat) {
                                            case "title-only":
                                                newContent = {
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                            case "title-subtitle":
                                                newContent = {
                                                    subtitle: "Subtitle",
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                            case "title-bullets":
                                                newContent = {
                                                    bullets: ["Bullet point 1"],
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                            case "title-paragraph":
                                                newContent = {
                                                    paragraph:
                                                        "Enter your paragraph text here.",
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                            case "title-2columns":
                                                newContent = {
                                                    leftColumn: "Left column",
                                                    rightColumn: "Right column",
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                            case "title-image":
                                                newContent = {
                                                    image: {
                                                        description:
                                                            "Image description",
                                                        position: "center",
                                                    },
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                            case "comparison":
                                                newContent = {
                                                    leftTitle: "Left",
                                                    leftItems: ["Item 1"],
                                                    rightTitle: "Right",
                                                    rightItems: ["Item 1"],
                                                    polls: [],
                                                    buttons: [],
                                                };
                                                break;
                                        }

                                        // Reconstruct the slide with the new format and content
                                        const currentSlide = s();
                                        updateSlide({
                                            ...currentSlide,
                                            format: newFormat,
                                            content: newContent,
                                        } as SlideFormat);
                                    }}
                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 focus:outline-none"
                                >
                                    <option value="title-only">
                                        Title Only
                                    </option>
                                    <option value="title-subtitle">
                                        Title + Subtitle
                                    </option>
                                    <option value="title-bullets">
                                        Title + Bullets
                                    </option>
                                    <option value="title-paragraph">
                                        Title + Paragraph
                                    </option>
                                    <option value="title-2columns">
                                        Title + 2 Columns
                                    </option>
                                    <option value="title-image">
                                        Title + Image
                                    </option>
                                    <option value="comparison">
                                        Comparison
                                    </option>
                                </select>
                            </div>

                            {/* Style Properties */}
                            <div>
                                <label class="text-bg-text mb-2 block text-sm font-medium">
                                    Background Color
                                </label>
                                <input
                                    type="color"
                                    value={
                                        s().style?.backgroundColor || "#1a1d24"
                                    }
                                    onInput={(e) =>
                                        updateStyle({
                                            backgroundColor:
                                                e.currentTarget.value,
                                        })
                                    }
                                    class="border-border-sidebar bg-bg-input h-10 w-full cursor-pointer rounded-lg border"
                                />
                            </div>

                            <div>
                                <label class="text-bg-text mb-2 block text-sm font-medium">
                                    Text Color
                                </label>
                                <input
                                    type="color"
                                    value={s().style?.textColor || "#ffffff"}
                                    onInput={(e) =>
                                        updateStyle({
                                            textColor: e.currentTarget.value,
                                        })
                                    }
                                    class="border-border-sidebar bg-bg-input h-10 w-full cursor-pointer rounded-lg border"
                                />
                            </div>
                        </div>

                        {/* Format-specific content editing */}
                        <div class="mb-6 space-y-5">
                            <h3 class="text-md text-bg-text font-semibold">
                                Content
                            </h3>

                            <Show when={s().format === "title-subtitle"}>
                                <div>
                                    <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                        Subtitle
                                    </label>
                                    <input
                                        type="text"
                                        value={s().content.subtitle}
                                        onInput={(e) =>
                                            updateContent({
                                                subtitle: e.currentTarget.value,
                                            })
                                        }
                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                    />
                                </div>
                            </Show>

                            <Show when={s().format === "title-bullets"}>
                                <div>
                                    <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                        Bullet Points
                                    </label>
                                    <For each={s().content.bullets}>
                                        {(bullet, i) => (
                                            <div class="mb-2 flex gap-2">
                                                <input
                                                    type="text"
                                                    value={bullet}
                                                    onInput={(e) => {
                                                        const bullets = [
                                                            ...s().content
                                                                .bullets,
                                                        ];
                                                        bullets[i()] =
                                                            e.currentTarget.value;
                                                        updateContent({
                                                            bullets,
                                                        });
                                                    }}
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const bullets =
                                                            s().content.bullets.filter(
                                                                (_, idx) =>
                                                                    idx !== i(),
                                                            );
                                                        if (
                                                            bullets.length === 0
                                                        )
                                                            bullets.push("");
                                                        updateContent({
                                                            bullets,
                                                        });
                                                    }}
                                                    class="cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}
                                    </For>
                                    <button
                                        onClick={() => {
                                            if (
                                                s().content.bullets.length < 7
                                            ) {
                                                updateContent({
                                                    bullets: [
                                                        ...s().content.bullets,
                                                        "",
                                                    ],
                                                });
                                            }
                                        }}
                                        disabled={
                                            s().content.bullets.length >= 7
                                        }
                                        class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover mt-2 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        + Add Bullet
                                    </button>
                                </div>
                            </Show>

                            <Show when={s().format === "title-paragraph"}>
                                <div>
                                    <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                        Paragraph
                                    </label>
                                    <textarea
                                        value={s().content.paragraph}
                                        onInput={(e) =>
                                            updateContent({
                                                paragraph:
                                                    e.currentTarget.value,
                                            })
                                        }
                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        rows={6}
                                    />
                                </div>
                            </Show>

                            <Show when={s().format === "title-2columns"}>
                                <div class="space-y-3">
                                    <div>
                                        <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                            Left Column
                                        </label>
                                        <textarea
                                            value={s().content.leftColumn}
                                            onInput={(e) =>
                                                updateContent({
                                                    leftColumn:
                                                        e.currentTarget.value,
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                            rows={4}
                                        />
                                    </div>
                                    <div>
                                        <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                            Right Column
                                        </label>
                                        <textarea
                                            value={s().content.rightColumn}
                                            onInput={(e) =>
                                                updateContent({
                                                    rightColumn:
                                                        e.currentTarget.value,
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                            rows={4}
                                        />
                                    </div>
                                </div>
                            </Show>

                            <Show when={s().format === "comparison"}>
                                <div class="space-y-3">
                                    <div>
                                        <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                            Left Title
                                        </label>
                                        <input
                                            type="text"
                                            value={s().content.leftTitle}
                                            onInput={(e) =>
                                                updateContent({
                                                    leftTitle:
                                                        e.currentTarget.value,
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                            Left Items
                                        </label>
                                        <For each={s().content.leftItems}>
                                            {(item, i) => (
                                                <div class="mb-2 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onInput={(e) => {
                                                            const items = [
                                                                ...s().content
                                                                    .leftItems,
                                                            ];
                                                            items[i()] =
                                                                e.currentTarget.value;
                                                            updateContent({
                                                                leftItems:
                                                                    items,
                                                            });
                                                        }}
                                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const items =
                                                                s().content.leftItems.filter(
                                                                    (_, idx) =>
                                                                        idx !==
                                                                        i(),
                                                                );
                                                            if (
                                                                items.length ===
                                                                0
                                                            )
                                                                items.push("");
                                                            updateContent({
                                                                leftItems:
                                                                    items,
                                                            });
                                                        }}
                                                        class="cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            )}
                                        </For>
                                        <button
                                            onClick={() => {
                                                if (
                                                    s().content.leftItems
                                                        .length < 5
                                                ) {
                                                    updateContent({
                                                        leftItems: [
                                                            ...s().content
                                                                .leftItems,
                                                            "",
                                                        ],
                                                    });
                                                }
                                            }}
                                            disabled={
                                                s().content.leftItems.length >=
                                                5
                                            }
                                            class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover mt-2 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            + Add Left Item
                                        </button>
                                    </div>
                                    <div>
                                        <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                            Right Title
                                        </label>
                                        <input
                                            type="text"
                                            value={s().content.rightTitle}
                                            onInput={(e) =>
                                                updateContent({
                                                    rightTitle:
                                                        e.currentTarget.value,
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                            Right Items
                                        </label>
                                        <For each={s().content.rightItems}>
                                            {(item, i) => (
                                                <div class="mb-2 flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onInput={(e) => {
                                                            const items = [
                                                                ...s().content
                                                                    .rightItems,
                                                            ];
                                                            items[i()] =
                                                                e.currentTarget.value;
                                                            updateContent({
                                                                rightItems:
                                                                    items,
                                                            });
                                                        }}
                                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const items =
                                                                s().content.rightItems.filter(
                                                                    (_, idx) =>
                                                                        idx !==
                                                                        i(),
                                                                );
                                                            if (
                                                                items.length ===
                                                                0
                                                            )
                                                                items.push("");
                                                            updateContent({
                                                                rightItems:
                                                                    items,
                                                            });
                                                        }}
                                                        class="cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            )}
                                        </For>
                                        <button
                                            onClick={() => {
                                                if (
                                                    s().content.rightItems
                                                        .length < 5
                                                ) {
                                                    updateContent({
                                                        rightItems: [
                                                            ...s().content
                                                                .rightItems,
                                                            "",
                                                        ],
                                                    });
                                                }
                                            }}
                                            disabled={
                                                s().content.rightItems.length >=
                                                5
                                            }
                                            class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover mt-2 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            + Add Right Item
                                        </button>
                                    </div>
                                </div>
                            </Show>

                            {/* Image editing (for formats that support it) */}
                            <Show
                                when={
                                    s().format === "title-only" ||
                                    s().format === "title-subtitle" ||
                                    s().format === "title-bullets" ||
                                    s().format === "title-paragraph" ||
                                    s().format === "title-2columns" ||
                                    s().format === "comparison"
                                }
                            >
                                <div>
                                    <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
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
                                                                description:
                                                                    e
                                                                        .currentTarget
                                                                        .value,
                                                            },
                                                        })
                                                    }
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                                />
                                                <input
                                                    type="url"
                                                    placeholder="Image URL (optional)"
                                                    value={img().url || ""}
                                                    onInput={(e) =>
                                                        updateContent({
                                                            image: {
                                                                ...img(),
                                                                url:
                                                                    e
                                                                        .currentTarget
                                                                        .value ||
                                                                    undefined,
                                                            },
                                                        })
                                                    }
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                                />
                                                <select
                                                    value={img().position}
                                                    onChange={(e) =>
                                                        updateContent({
                                                            image: {
                                                                ...img(),
                                                                position: e
                                                                    .currentTarget
                                                                    .value as any,
                                                            },
                                                        })
                                                    }
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                                >
                                                    <option value="left">
                                                        Left
                                                    </option>
                                                    <option value="right">
                                                        Right
                                                    </option>
                                                    <option value="center">
                                                        Center
                                                    </option>
                                                    <option value="full">
                                                        Full
                                                    </option>
                                                    <option value="top">
                                                        Top
                                                    </option>
                                                    <option value="bottom">
                                                        Bottom
                                                    </option>
                                                </select>
                                                <button
                                                    onClick={() =>
                                                        updateContent({
                                                            image: undefined,
                                                        })
                                                    }
                                                    class="w-full cursor-pointer rounded-lg bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
                                                >
                                                    Remove Image
                                                </button>
                                            </div>
                                        )}
                                    </Show>
                                    <Show when={!s().content.image}>
                                        <button
                                            onClick={() =>
                                                updateContent({
                                                    image: {
                                                        description:
                                                            "Image description",
                                                        position: "center",
                                                    },
                                                })
                                            }
                                            class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover w-full cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                                        >
                                            + Add Image
                                        </button>
                                    </Show>
                                </div>
                            </Show>

                            {/* Image editing for title-image format (required) */}
                            <Show when={s().format === "title-image"}>
                                <div>
                                    <label class="text-bg-text mb-2 block text-sm font-medium opacity-70">
                                        Image (Required)
                                    </label>
                                    <div class="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Image description"
                                            value={
                                                s().content.image.description
                                            }
                                            onInput={(e) =>
                                                updateContent({
                                                    image: {
                                                        ...s().content.image,
                                                        description:
                                                            e.currentTarget
                                                                .value,
                                                    },
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        />
                                        <input
                                            type="url"
                                            placeholder="Image URL (optional)"
                                            value={s().content.image.url || ""}
                                            onInput={(e) =>
                                                updateContent({
                                                    image: {
                                                        ...s().content.image,
                                                        url:
                                                            e.currentTarget
                                                                .value ||
                                                            undefined,
                                                    },
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        />
                                        <select
                                            value={s().content.image.position}
                                            onChange={(e) =>
                                                updateContent({
                                                    image: {
                                                        ...s().content.image,
                                                        position: e
                                                            .currentTarget
                                                            .value as any,
                                                    },
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        >
                                            <option value="left">Left</option>
                                            <option value="right">Right</option>
                                            <option value="center">
                                                Center
                                            </option>
                                            <option value="full">Full</option>
                                            <option value="top">Top</option>
                                            <option value="bottom">
                                                Bottom
                                            </option>
                                        </select>
                                        <input
                                            type="text"
                                            placeholder="Image caption (optional)"
                                            value={
                                                s().content.image.caption || ""
                                            }
                                            onInput={(e) =>
                                                updateContent({
                                                    image: {
                                                        ...s().content.image,
                                                        caption:
                                                            e.currentTarget
                                                                .value ||
                                                            undefined,
                                                    },
                                                })
                                            }
                                            class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-3 py-2 text-sm focus:outline-none"
                                        />
                                    </div>
                                </div>
                            </Show>

                            {/* Polls Section */}
                            <div class="mb-6 space-y-3">
                                <div class="flex items-center justify-between">
                                    <h3 class="text-md text-bg-text font-semibold">
                                        Polls
                                    </h3>
                                    <button
                                        onClick={() => {
                                            const currentPolls =
                                                s().content.polls || [];
                                            if (currentPolls.length < 5) {
                                                const newPollId = `poll-${Date.now()}`;
                                                updateContent({
                                                    polls: [
                                                        ...currentPolls,
                                                        {
                                                            id: newPollId,
                                                            type: "accumulator" as PollType,
                                                            displayOnSlide: false,
                                                        },
                                                    ],
                                                });
                                            }
                                        }}
                                        disabled={
                                            (s().content.polls || []).length >=
                                            5
                                        }
                                        class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        + Add Poll
                                    </button>
                                </div>
                                <For each={s().content.polls || []}>
                                    {(poll, pollIdx) => (
                                        <div class="border-border-sidebar bg-bg-card space-y-2 rounded-lg border p-3">
                                            <div class="flex items-center justify-between">
                                                <h4 class="text-bg-text text-sm font-medium">
                                                    Poll #{pollIdx() + 1}
                                                </h4>
                                                <button
                                                    onClick={() => {
                                                        const polls = (
                                                            s().content.polls ||
                                                            []
                                                        ).filter(
                                                            (_, idx) =>
                                                                idx !==
                                                                pollIdx(),
                                                        );
                                                        // Also remove buttons that reference this poll
                                                        const buttons = (
                                                            s().content
                                                                .buttons || []
                                                        ).filter(
                                                            (b) =>
                                                                b.pollId !==
                                                                poll.id,
                                                        );
                                                        updateContent({
                                                            polls,
                                                            buttons,
                                                        });
                                                    }}
                                                    class="cursor-pointer text-xs text-red-400 transition-colors hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                            <div>
                                                <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                    Poll ID
                                                </label>
                                                <input
                                                    type="text"
                                                    value={poll.id}
                                                    onInput={(e) => {
                                                        const polls = [
                                                            ...(s().content
                                                                .polls || []),
                                                        ];
                                                        polls[pollIdx()] = {
                                                            ...poll,
                                                            id: e.currentTarget
                                                                .value,
                                                        };
                                                        updateContent({
                                                            polls,
                                                        });
                                                    }}
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                    Type
                                                </label>
                                                <select
                                                    value={
                                                        poll.type ||
                                                        "accumulator"
                                                    }
                                                    onChange={(e) => {
                                                        const polls = [
                                                            ...(s().content
                                                                .polls || []),
                                                        ];
                                                        polls[pollIdx()] = {
                                                            ...poll,
                                                            type: e
                                                                .currentTarget
                                                                .value as PollType,
                                                        };
                                                        updateContent({
                                                            polls,
                                                        });
                                                    }}
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                >
                                                    <option value="accumulator">
                                                        Accumulator
                                                    </option>
                                                    <option value="action-trigger">
                                                        Action Trigger
                                                    </option>
                                                    <option value="choice">
                                                        Choice
                                                    </option>
                                                    <option value="feedback">
                                                        Feedback
                                                    </option>
                                                </select>
                                            </div>
                                            <div>
                                                <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                    Question (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={poll.question || ""}
                                                    onInput={(e) => {
                                                        const polls = [
                                                            ...(s().content
                                                                .polls || []),
                                                        ];
                                                        polls[pollIdx()] = {
                                                            ...poll,
                                                            question:
                                                                e.currentTarget
                                                                    .value ||
                                                                undefined,
                                                        };
                                                        updateContent({
                                                            polls,
                                                        });
                                                    }}
                                                    placeholder="Enter poll question"
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                />
                                            </div>
                                            <Show
                                                when={
                                                    poll.type === "accumulator"
                                                }
                                            >
                                                <div class="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            poll.displayOnSlide ||
                                                            false
                                                        }
                                                        onChange={(e) => {
                                                            const polls = [
                                                                ...(s().content
                                                                    .polls ||
                                                                    []),
                                                            ];
                                                            polls[pollIdx()] = {
                                                                ...poll,
                                                                displayOnSlide:
                                                                    e
                                                                        .currentTarget
                                                                        .checked,
                                                            };
                                                            updateContent({
                                                                polls,
                                                            });
                                                        }}
                                                        class="border-border-sidebar rounded"
                                                    />
                                                    <label class="text-bg-text text-xs opacity-70">
                                                        Display vote count on
                                                        slide
                                                    </label>
                                                </div>
                                            </Show>
                                            <Show
                                                when={
                                                    poll.type ===
                                                    "action-trigger"
                                                }
                                            >
                                                <div>
                                                    <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                        Threshold (votes needed)
                                                    </label>
                                                    <input
                                                        type="number"
                                                        value={
                                                            poll.threshold || 1
                                                        }
                                                        min="1"
                                                        max="10000"
                                                        onInput={(e) => {
                                                            const polls = [
                                                                ...(s().content
                                                                    .polls ||
                                                                    []),
                                                            ];
                                                            polls[pollIdx()] = {
                                                                ...poll,
                                                                threshold:
                                                                    parseInt(
                                                                        e
                                                                            .currentTarget
                                                                            .value,
                                                                        10,
                                                                    ) || 1,
                                                            };
                                                            updateContent({
                                                                polls,
                                                            });
                                                        }}
                                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                    />
                                                </div>
                                                <div>
                                                    <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                        Action Type
                                                    </label>
                                                    <select
                                                        value={
                                                            poll.action?.type ||
                                                            "skip-slide"
                                                        }
                                                        onChange={(e) => {
                                                            const polls = [
                                                                ...(s().content
                                                                    .polls ||
                                                                    []),
                                                            ];
                                                            polls[pollIdx()] = {
                                                                ...poll,
                                                                action: {
                                                                    type: e
                                                                        .currentTarget
                                                                        .value as PollActionType,
                                                                    metadata:
                                                                        poll
                                                                            .action
                                                                            ?.metadata,
                                                                },
                                                            };
                                                            updateContent({
                                                                polls,
                                                            });
                                                        }}
                                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                    >
                                                        <option value="reorder-slides">
                                                            Reorder Slides
                                                        </option>
                                                        <option value="delete-slides">
                                                            Delete Slides
                                                        </option>
                                                        <option value="skip-slide">
                                                            Skip Slide
                                                        </option>
                                                        <option value="jump-slide">
                                                            Jump to Slide
                                                        </option>
                                                        <option value="display-results">
                                                            Display Results
                                                        </option>
                                                        <option value="hide-slides">
                                                            Hide Slides
                                                        </option>
                                                    </select>
                                                </div>
                                            </Show>
                                        </div>
                                    )}
                                </For>
                                <Show
                                    when={
                                        (s().content.polls || []).length === 0
                                    }
                                >
                                    <p class="text-xs text-gray-500">
                                        No polls added. Add polls to enable
                                        interactive voting.
                                    </p>
                                </Show>
                            </div>

                            {/* Buttons Section */}
                            <div class="mb-6 space-y-3">
                                <div class="flex items-center justify-between">
                                    <h3 class="text-md text-bg-text font-semibold">
                                        Buttons
                                    </h3>
                                    <button
                                        onClick={() => {
                                            const currentButtons =
                                                s().content.buttons || [];
                                            const availablePolls =
                                                s().content.polls || [];
                                            if (
                                                currentButtons.length < 10 &&
                                                availablePolls.length > 0
                                            ) {
                                                updateContent({
                                                    buttons: [
                                                        ...currentButtons,
                                                        {
                                                            text: "Click Me",
                                                            pollId: availablePolls[0]
                                                                .id,
                                                            action: {
                                                                type: "vote",
                                                            },
                                                        },
                                                    ],
                                                });
                                            }
                                        }}
                                        disabled={
                                            (s().content.buttons || [])
                                                .length >= 10 ||
                                            (s().content.polls || []).length ===
                                                0
                                        }
                                        class="bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        + Add Button
                                    </button>
                                </div>
                                <Show
                                    when={
                                        (s().content.polls || []).length === 0
                                    }
                                >
                                    <p class="text-xs text-gray-500">
                                        Add at least one poll before adding
                                        buttons.
                                    </p>
                                </Show>
                                <For each={s().content.buttons || []}>
                                    {(button, buttonIdx) => (
                                        <div class="border-border-sidebar bg-bg-card space-y-2 rounded-lg border p-3">
                                            <div class="flex items-center justify-between">
                                                <h4 class="text-bg-text text-sm font-medium">
                                                    Button #{buttonIdx() + 1}
                                                </h4>
                                                <button
                                                    onClick={() => {
                                                        const buttons = (
                                                            s().content
                                                                .buttons || []
                                                        ).filter(
                                                            (_, idx) =>
                                                                idx !==
                                                                buttonIdx(),
                                                        );
                                                        updateContent({
                                                            buttons,
                                                        });
                                                    }}
                                                    class="cursor-pointer text-xs text-red-400 transition-colors hover:text-red-300"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                            <div>
                                                <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                    Button Text
                                                </label>
                                                <input
                                                    type="text"
                                                    value={button.text}
                                                    onInput={(e) => {
                                                        const buttons = [
                                                            ...(s().content
                                                                .buttons || []),
                                                        ];
                                                        buttons[buttonIdx()] = {
                                                            ...button,
                                                            text: e
                                                                .currentTarget
                                                                .value,
                                                        };
                                                        updateContent({
                                                            buttons,
                                                        });
                                                    }}
                                                    maxLength={50}
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                    Poll ID (must match an
                                                    existing poll)
                                                </label>
                                                <select
                                                    value={button.pollId}
                                                    onChange={(e) => {
                                                        const buttons = [
                                                            ...(s().content
                                                                .buttons || []),
                                                        ];
                                                        buttons[buttonIdx()] = {
                                                            ...button,
                                                            pollId: e
                                                                .currentTarget
                                                                .value,
                                                        };
                                                        updateContent({
                                                            buttons,
                                                        });
                                                    }}
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                >
                                                    <For
                                                        each={
                                                            s().content.polls ||
                                                            []
                                                        }
                                                    >
                                                        {(poll) => (
                                                            <option
                                                                value={poll.id}
                                                            >
                                                                {poll.id}{" "}
                                                                {poll.question
                                                                    ? `- ${poll.question}`
                                                                    : ""}
                                                            </option>
                                                        )}
                                                    </For>
                                                </select>
                                            </div>
                                            <div>
                                                <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                    Action Type
                                                </label>
                                                <select
                                                    value={
                                                        button.action?.type ||
                                                        "vote"
                                                    }
                                                    onChange={(e) => {
                                                        const buttons = [
                                                            ...(s().content
                                                                .buttons || []),
                                                        ];
                                                        buttons[buttonIdx()] = {
                                                            ...button,
                                                            action: {
                                                                type: e
                                                                    .currentTarget
                                                                    .value as
                                                                    | "vote"
                                                                    | "vote-with-value",
                                                                value: button
                                                                    .action
                                                                    ?.value,
                                                            },
                                                        };
                                                        updateContent({
                                                            buttons,
                                                        });
                                                    }}
                                                    class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                >
                                                    <option value="vote">
                                                        Vote
                                                    </option>
                                                    <option value="vote-with-value">
                                                        Vote with Value
                                                    </option>
                                                </select>
                                            </div>
                                            <Show
                                                when={
                                                    button.action?.type ===
                                                    "vote-with-value"
                                                }
                                            >
                                                <div>
                                                    <label class="text-bg-text mb-1 block text-xs font-medium opacity-70">
                                                        Value
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={
                                                            button.action?.value?.toString() ||
                                                            ""
                                                        }
                                                        onInput={(e) => {
                                                            const buttons = [
                                                                ...(s().content
                                                                    .buttons ||
                                                                    []),
                                                            ];
                                                            const value =
                                                                e.currentTarget
                                                                    .value;
                                                            buttons[
                                                                buttonIdx()
                                                            ] = {
                                                                ...button,
                                                                action: {
                                                                    type: "vote-with-value",
                                                                    value: isNaN(
                                                                        Number(
                                                                            value,
                                                                        ),
                                                                    )
                                                                        ? value
                                                                        : Number(
                                                                              value,
                                                                          ),
                                                                },
                                                            };
                                                            updateContent({
                                                                buttons,
                                                            });
                                                        }}
                                                        placeholder="Enter value (number or string)"
                                                        class="border-border-sidebar bg-bg-input text-bg-text focus:border-bg-primary-btn-link w-full rounded-lg border px-2 py-1.5 text-xs focus:outline-none"
                                                    />
                                                </div>
                                            </Show>
                                        </div>
                                    )}
                                </For>
                                <Show
                                    when={
                                        (s().content.buttons || []).length ===
                                            0 &&
                                        (s().content.polls || []).length > 0
                                    }
                                >
                                    <p class="text-xs text-gray-500">
                                        No buttons added. Buttons allow users to
                                        interact with polls.
                                    </p>
                                </Show>
                            </div>
                        </div>
                    </>
                )}
            </Show>
        </div>
    );
}
