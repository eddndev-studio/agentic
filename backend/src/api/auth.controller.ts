import { Elysia, t } from "elysia";
import { AuthService } from "../services/auth.service";
import { OrgService } from "../services/org.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const authController = new Elysia({ prefix: "/auth" })
    .use(authMiddleware)

    // ── Public endpoints ───────────────────────────────────────────────────

    .post("/register", async ({ body, jwt, set }) => {
        try {
            const { email, password, fullName } = body;

            const authUser = await AuthService.register(email, password, fullName, jwt.sign);

            const token = await jwt.sign({
                id: authUser.id,
                email: authUser.email,
                orgId: authUser.orgId,
                role: authUser.role,
                exp: Math.floor(Date.now() / 1000) + 86400
            });

            return { token, user: authUser };
        } catch (error: any) {
            if (error.message === "EMAIL_EXISTS") {
                set.status = 409;
                return { error: "Email already registered" };
            }
            console.error("Register Error:", error);
            set.status = 500;
            return { error: "Internal Server Error" };
        }
    }, {
        body: t.Object({
            email: t.String({ format: "email" }),
            password: t.String({ minLength: 8 }),
            fullName: t.String({ minLength: 1 })
        })
    })

    .post("/login", async ({ body, jwt, set }) => {
        try {
            const { email, password } = body;

            const authUser = await AuthService.validateUser(email, password);
            if (!authUser) {
                set.status = 401;
                return { error: "Invalid credentials" };
            }

            const token = await jwt.sign({
                id: authUser.id,
                email: authUser.email,
                orgId: authUser.orgId,
                role: authUser.role,
                exp: Math.floor(Date.now() / 1000) + 86400
            });

            return { token, user: authUser };
        } catch (error) {
            console.error("Login Error:", error);
            set.status = 500;
            return { error: "Internal Server Error" };
        }
    }, {
        body: t.Object({
            email: t.String({ format: "email" }),
            password: t.String()
        })
    })

    .post("/google", async ({ body, jwt, set }) => {
        try {
            const authUser = await AuthService.googleAuth(body.idToken);

            const token = await jwt.sign({
                id: authUser.id,
                email: authUser.email,
                orgId: authUser.orgId,
                role: authUser.role,
                exp: Math.floor(Date.now() / 1000) + 86400
            });

            return { token, user: authUser };
        } catch (error: any) {
            if (error.message === "INVALID_GOOGLE_TOKEN" || error.message === "GOOGLE_NO_EMAIL") {
                set.status = 401;
                return { error: "Invalid Google token" };
            }
            console.error("Google Auth Error:", error);
            set.status = 500;
            return { error: "Internal Server Error" };
        }
    }, {
        body: t.Object({
            idToken: t.String()
        })
    })

    .post("/verify-email", async ({ body, jwt, set }) => {
        try {
            const payload = await jwt.verify(body.token);
            if (!payload || payload.type !== "email-verify" || !payload.userId) {
                set.status = 400;
                return { error: "Invalid or expired token" };
            }

            await AuthService.verifyEmail(payload.userId as string);
            return { success: true };
        } catch {
            set.status = 400;
            return { error: "Invalid or expired token" };
        }
    }, {
        body: t.Object({ token: t.String() })
    })

    .post("/forgot-password", async ({ body, jwt }) => {
        await AuthService.forgotPassword(body.email, jwt.sign);
        // Always return success (don't reveal if email exists)
        return { success: true };
    }, {
        body: t.Object({ email: t.String({ format: "email" }) })
    })

    .post("/reset-password", async ({ body, jwt, set }) => {
        try {
            const payload = await jwt.verify(body.token);
            if (!payload || payload.type !== "password-reset" || !payload.userId) {
                set.status = 400;
                return { error: "Invalid or expired token" };
            }

            await AuthService.resetPassword(payload.userId as string, body.password);
            return { success: true };
        } catch {
            set.status = 400;
            return { error: "Invalid or expired token" };
        }
    }, {
        body: t.Object({
            token: t.String(),
            password: t.String({ minLength: 8 })
        })
    })

    .post("/accept-invite", async ({ body, jwt, set }) => {
        try {
            const membership = await OrgService.acceptInvitation(
                body.token,
                null,
                body.password ? { email: body.email!, password: body.password, fullName: body.fullName! } : undefined
            );

            // If user provided credentials, generate a token for them
            if (body.password) {
                const token = await jwt.sign({
                    id: membership.userId,
                    email: body.email,
                    orgId: membership.orgId,
                    role: membership.role,
                    exp: Math.floor(Date.now() / 1000) + 86400
                });
                return { token, membership };
            }

            return { success: true, membership };
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                INVITATION_NOT_FOUND: [404, "Invitation not found"],
                INVITATION_ALREADY_ACCEPTED: [409, "Invitation already accepted"],
                INVITATION_EXPIRED: [410, "Invitation has expired"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        body: t.Object({
            token: t.String(),
            email: t.Optional(t.String({ format: "email" })),
            password: t.Optional(t.String({ minLength: 8 })),
            fullName: t.Optional(t.String())
        })
    })

    .post("/logout", ({ cookie: { auth_token } }) => {
        auth_token.remove();
        return { success: true };
    })

    // ── Protected endpoints ────────────────────────────────────────────────

    .get("/me", async ({ user }) => {
        const profile = await AuthService.getProfile(user!.id, user!.orgId);
        if (!profile) return { error: "User not found" };
        return profile;
    }, {
        isSignIn: true
    })

    .put("/me", async ({ user, body }) => {
        return AuthService.updateProfile(user!.id, body);
    }, {
        isSignIn: true,
        body: t.Object({
            fullName: t.Optional(t.String()),
            avatarUrl: t.Optional(t.String())
        })
    })

    .put("/me/password", async ({ user, body, set }) => {
        try {
            await AuthService.changePassword(user!.id, body.currentPassword, body.newPassword);
            return { success: true };
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                WRONG_PASSWORD: [403, "Password actual incorrecta"],
                USER_NOT_FOUND: [404, "Usuario no encontrado"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isSignIn: true,
        body: t.Object({
            currentPassword: t.String(),
            newPassword: t.String({ minLength: 8 })
        })
    })

    .put("/me/email", async ({ user, body, jwt, set }) => {
        try {
            await AuthService.changeEmail(user!.id, body.newEmail, body.password, jwt.sign);
            return { success: true };
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                WRONG_PASSWORD: [403, "Password incorrecta"],
                EMAIL_EXISTS: [409, "Email ya registrado"],
                NO_PASSWORD_SET: [400, "Establece una password primero"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isSignIn: true,
        body: t.Object({
            newEmail: t.String({ format: "email" }),
            password: t.String()
        })
    })

    .post("/me/link-google", async ({ user, body, set }) => {
        try {
            await AuthService.linkGoogle(user!.id, body.idToken);
            return { success: true };
        } catch (e: any) {
            const map: Record<string, [number, string]> = {
                INVALID_GOOGLE_TOKEN: [401, "Token de Google invalido"],
                GOOGLE_EMAIL_TAKEN: [409, "El email de Google ya esta asociado a otra cuenta"],
            };
            const [status, msg] = map[e.message] ?? [500, "Internal Server Error"];
            set.status = status;
            return { error: msg };
        }
    }, {
        isSignIn: true,
        body: t.Object({ idToken: t.String() })
    })

    .post("/me/unlink-google", async ({ user, set }) => {
        try {
            await AuthService.unlinkGoogle(user!.id);
            return { success: true };
        } catch (e: any) {
            if (e.message === "SET_PASSWORD_FIRST") {
                set.status = 400;
                return { error: "Debes establecer una password antes de desvincular Google" };
            }
            set.status = 500;
            return { error: "Internal Server Error" };
        }
    }, { isSignIn: true })

    .post("/switch-org", async ({ user, body, jwt, set }) => {
        const membership = await AuthService.switchOrg(user!.id, body.orgId);
        if (!membership) {
            set.status = 403;
            return { error: "Not a member of this organization" };
        }

        const token = await jwt.sign({
            id: user!.id,
            email: user!.email,
            orgId: membership.orgId,
            role: membership.role,
            exp: Math.floor(Date.now() / 1000) + 86400
        });

        return { token, orgId: membership.orgId, role: membership.role };
    }, {
        isSignIn: true,
        body: t.Object({ orgId: t.String() })
    });
