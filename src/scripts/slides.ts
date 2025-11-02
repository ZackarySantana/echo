import z from "zod";
import { SlideFormatSchema } from "../lib/slides";

export const parseSlides = (slides: any) => {
    if (!slides) return null;
    return z.array(SlideFormatSchema).parse(slides);
};
