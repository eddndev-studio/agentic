import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { OrgService } from "../services/org.service";

const RoleEnum = t.Union([
    t.Literal("ADMIN"),
    t.Literal("SUPERVISOR"),
    t.Literal("WORKER")
]);

export const orgController = new Elysia({ prefix: "/org" })
    .use(authMiddleware)

    // ── Members ────────────────────────────────────────────────────────────

    .get("/members", async ({ user }) => {
        return OrgService.listMembers(user!.orgId);
    }, { isSignIn: true })

    .put("/members/:id/role", async ({ user, params, body, set }) => {
        try {
            return await OrgService.updateMemberRole(user!.orgId, params.id, body.role);
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                MEMBER_NOT_FOUND: [404, "Member not found"],
                CANNOT_CHANGE_OWNER_ROLE: [403, "Cannot change the owner's role"],
                USE_TRANSFER_OWNERSHIP: [400, "Use transfer-ownership to assign OWNER role"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isAdmin: true,
        body: t.Object({ role: RoleEnum }),
        params: t.Object({ id: t.String() })
    })

    .delete("/members/:id", async ({ user, params, set }) => {
        try {
            await OrgService.removeMember(user!.orgId, params.id);
            return { success: true };
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                MEMBER_NOT_FOUND: [404, "Member not found"],
                CANNOT_REMOVE_OWNER: [403, "Cannot remove the owner"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isAdmin: true,
        params: t.Object({ id: t.String() })
    })

    // ── Invitations ────────────────────────────────────────────────────────

    .get("/invitations", async ({ user }) => {
        return OrgService.listInvitations(user!.orgId);
    }, { isAdmin: true })

    .post("/invitations", async ({ user, body, set }) => {
        try {
            return await OrgService.createInvitation(user!.orgId, body.email, body.role);
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                CANNOT_INVITE_AS_OWNER: [400, "Cannot invite as OWNER"],
                ALREADY_MEMBER: [409, "User is already a member"],
                INVITATION_PENDING: [409, "An invitation is already pending for this email"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isAdmin: true,
        body: t.Object({
            email: t.String({ format: "email" }),
            role: RoleEnum
        })
    })

    .delete("/invitations/:id", async ({ user, params, set }) => {
        try {
            await OrgService.cancelInvitation(user!.orgId, params.id);
            return { success: true };
        } catch (e: any) {
            if (e.message === "INVITATION_NOT_FOUND") {
                set.status = 404;
                return { error: "Invitation not found" };
            }
            set.status = 500;
            return { error: "Internal Server Error" };
        }
    }, {
        isAdmin: true,
        params: t.Object({ id: t.String() })
    })

    // ── Transfer Ownership ─────────────────────────────────────────────────

    .post("/transfer-ownership", async ({ user, body, set }) => {
        try {
            await OrgService.transferOwnership(user!.orgId, user!.id, body.userId);
            return { success: true };
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                NOT_OWNER: [403, "Only the owner can transfer ownership"],
                TARGET_NOT_MEMBER: [404, "Target user is not a member of this organization"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isOwner: true,
        body: t.Object({ userId: t.String() })
    })

    // ── Worker Bot Assignments ─────────────────────────────────────────────

    .get("/members/:id/bots", async ({ user, params, set }) => {
        try {
            return await OrgService.getWorkerBots(user!.orgId, params.id);
        } catch (e: any) {
            if (e.message === "MEMBER_NOT_FOUND") {
                set.status = 404;
                return { error: "Member not found" };
            }
            set.status = 500;
            return { error: "Internal Server Error" };
        }
    }, {
        isAdmin: true,
        params: t.Object({ id: t.String() })
    })

    .put("/members/:id/bots", async ({ user, params, body, set }) => {
        try {
            return await OrgService.setWorkerBots(user!.orgId, params.id, body.botIds);
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                MEMBER_NOT_FOUND: [404, "Member not found"],
                INVALID_BOT_IDS: [400, "One or more bot IDs are invalid or don't belong to this organization"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isAdmin: true,
        params: t.Object({ id: t.String() }),
        body: t.Object({ botIds: t.Array(t.String()) })
    });
