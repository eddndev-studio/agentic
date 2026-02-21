import { Elysia } from "elysia";
import { ClientController } from "./client.controller";
import { authMiddleware } from "../middleware/auth.middleware";

export const clientRoutes = new Elysia({ prefix: "/clients" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", ClientController.getAll)
    .post("/", ClientController.create)
    .get("/:id", ClientController.getOne)
    .put("/:id", ClientController.update)
    .delete("/:id", ClientController.delete);
