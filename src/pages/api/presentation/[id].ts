import type { APIRoute } from "astro";
import { updatePresentation } from "../../../lib/db";
import { localsUser } from "../../../lib/auth";
import { redirectTo404 } from "../../../lib/util";
import { z } from "zod";
import { SlideFormatSchema } from "../../../lib/slides";

const UpdatePresentationSchema = z.object({
    name: z.string().min(1).optional(),
    slides: z.array(SlideFormatSchema).optional(),
    public: z.boolean().optional(),
});

export const PUT: APIRoute = async ({ params, request, locals }) => {
    const [user, resp] = localsUser(locals);
    if (resp) {
        return resp;
    }

    const { id } = params;
    if (!id) {
        return redirectTo404("Presentation ID is required.");
    }

    const idAsInt = parseInt(id, 10);
    if (isNaN(idAsInt)) {
        return redirectTo404("Invalid presentation ID.");
    }

    const body = await request.json();
    const parsed = UpdatePresentationSchema.safeParse(body);
    
    if (!parsed.success) {
        return new Response(
            JSON.stringify({ error: "Invalid request body", details: parsed.error }),
            { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }

    const [updated, err] = await updatePresentation(user.id, idAsInt, parsed.data);
    
    if (err) {
        return err;
    }

    return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

export const GET: APIRoute = async ({ params, locals }) => {
    const [user, resp] = localsUser(locals);
    if (resp) {
        return resp;
    }

    const { id } = params;
    if (!id) {
        return redirectTo404("Presentation ID is required.");
    }

    const { getPresentationById } = await import("../../../lib/db");
    const [presentation, err] = await getPresentationById(user.id, id);
    
    if (err) {
        return err;
    }

    return new Response(JSON.stringify(presentation), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
};

