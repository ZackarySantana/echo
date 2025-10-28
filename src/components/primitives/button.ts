export function buttonClass(primary: boolean): string {
    let cls =
        "block rounded-lg px-8 py-3 text-center font-semibold transition ";

    if (primary) {
        cls +=
            "bg-bg-primary-btn-link text-text-primary-btn-link hover:bg-bg-primary-btn-link-hover";
    } else {
        cls +=
            "bg-bg-secondary-btn-link text-text-secondary-btn-link hover:bg-bg-secondary-btn-link-hover";
    }
    return cls;
}
