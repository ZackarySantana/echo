import z from "zod";
import { SlideFormatSchema } from "../lib/slides";

export const parseSlides = (slides: any) => {
    return z.array(SlideFormatSchema).parse(slides);
};
