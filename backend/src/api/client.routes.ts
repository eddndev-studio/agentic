import { Elysia, t } from "elysia";
import { ClientController } from "./client.controller";
import { authMiddleware } from "../middleware/auth.middleware";

// Client handlers use explicit context types for internal type safety.
// The Elysia-derived context is a superset, so we cast at the boundary.
export const clientRoutes = new Elysia({ prefix: "/clients" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", (ctx) => ClientController.getAll(ctx))
    .post("/", (ctx) => ClientController.create(ctx), {
        body: t.Object({
            email: t.String(),
            phoneNumber: t.String(),
            botId: t.String(),
            curp: t.Optional(t.String()),
            status: t.Optional(t.String()),
        }),
    })
    .get("/:id", (ctx) => ClientController.getOne(ctx))
    .put("/:id", (ctx) => ClientController.update(ctx as Parameters<typeof ClientController.update>[0]))
    .delete("/:id", (ctx) => ClientController.delete(ctx));
