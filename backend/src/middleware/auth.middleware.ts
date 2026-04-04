import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";

export const authMiddleware = (app: Elysia) =>
    app
        .use(
            jwt({
                name: 'jwt',
                secret: process.env.JWT_SECRET || "DEV_SECRET_DO_NOT_USE_IN_PROOD"
            })
        )
        .derive(async ({ jwt, cookie: { auth_token }, headers: { authorization } }) => {
            let tokenValue = auth_token?.value as string | undefined;

            if (!tokenValue && authorization) {
                const parts = authorization.split(' ');
                if (parts.length === 2 && parts[0] === 'Bearer') {
                    tokenValue = parts[1];
                }
            }

            if (!tokenValue) {
                return { user: null as null };
            }

            const profile = await jwt.verify(tokenValue as string);
            if (!profile || !profile.exp) {
                return { user: null as null };
            }

            return {
                user: {
                    id: profile.id as string,
                    email: profile.email as string,
                    orgId: profile.orgId as string,
                    role: profile.role as string,
                }
            };
        })
        .macro(({ onBeforeHandle }) => ({
            isSignIn() {
                onBeforeHandle(({ user, error }: any) => {
                    if (!user) return error(401, "Unauthorized");
                });
            },
            isAdmin() {
                onBeforeHandle(({ user, error }: any) => {
                    if (!user) return error(401, "Unauthorized");
                    if (user.role !== "OWNER" && user.role !== "ADMIN")
                        return error(403, "Forbidden: requires ADMIN or OWNER role");
                });
            },
            isOwner() {
                onBeforeHandle(({ user, error }: any) => {
                    if (!user) return error(401, "Unauthorized");
                    if (user.role !== "OWNER")
                        return error(403, "Forbidden: requires OWNER role");
                });
            },
            isSupervisor() {
                onBeforeHandle(({ user, error }: any) => {
                    if (!user) return error(401, "Unauthorized");
                    if (!["OWNER", "ADMIN", "SUPERVISOR"].includes(user.role))
                        return error(403, "Forbidden: requires SUPERVISOR or higher role");
                });
            }
        }));
