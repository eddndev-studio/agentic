import { prisma } from "./postgres.service";
import { User, Role } from "@prisma/client";
import argon2 from "argon2";
import { EmailService } from "./email.service";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

export type AuthUser = {
    id: string;
    email: string;
    fullName: string | null;
    avatarUrl: string | null;
    orgId: string;
    role: Role;
};

export class AuthService {
    // ── Login ──────────────────────────────────────────────────────────────

    static async validateUser(email: string, passwordPlain: string): Promise<AuthUser | null> {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { memberships: { include: { org: true } } }
        });

        if (!user || !user.isActive || !user.passwordHash) return null;

        const isValid = await argon2.verify(user.passwordHash, passwordPlain);
        if (!isValid) return null;

        const membership = user.memberships[0];
        if (!membership) return null;

        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            avatarUrl: user.avatarUrl,
            orgId: membership.orgId,
            role: membership.role,
        };
    }

    // ── Register ───────────────────────────────────────────────────────────

    static async register(
        email: string,
        passwordPlain: string,
        fullName: string,
        jwtSign: (payload: any) => Promise<string>
    ): Promise<AuthUser> {
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) throw new Error("EMAIL_EXISTS");

        const passwordHash = await argon2.hash(passwordPlain, {
            type: argon2.argon2id,
            memoryCost: 4096,
            timeCost: 3
        });

        const slug = this.generateSlug(fullName || email);

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: { email, passwordHash, fullName, provider: "EMAIL" }
            });

            const org = await tx.organization.create({
                data: { name: fullName || email.split("@")[0], slug }
            });

            const membership = await tx.membership.create({
                data: { userId: user.id, orgId: org.id, role: "OWNER" }
            });

            return { user, org, membership };
        });

        // Send verification email (non-blocking)
        const verifyToken = await jwtSign({
            type: "email-verify",
            userId: result.user.id,
            exp: Math.floor(Date.now() / 1000) + 86400 // 24h
        });
        EmailService.sendVerificationEmail(email, verifyToken).catch(console.error);

        return {
            id: result.user.id,
            email: result.user.email,
            fullName: result.user.fullName,
            avatarUrl: result.user.avatarUrl,
            orgId: result.org.id,
            role: result.membership.role,
        };
    }

    // ── Google OAuth ───────────────────────────────────────────────────────

    static async googleAuth(idToken: string): Promise<AuthUser> {
        // Verify the ID token with Google
        const res = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
        );
        if (!res.ok) throw new Error("INVALID_GOOGLE_TOKEN");

        const payload: any = await res.json();
        if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error("INVALID_GOOGLE_TOKEN");

        const { email, name, picture, sub: googleId } = payload;
        if (!email) throw new Error("GOOGLE_NO_EMAIL");

        // Find or create user
        let user = await prisma.user.findUnique({
            where: { email },
            include: { memberships: true }
        });

        if (user) {
            // Existing user — update Google info if needed
            if (!user.avatarUrl && picture) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: { avatarUrl: picture, emailVerified: true }
                });
            }

            const membership = user.memberships[0];
            if (!membership) throw new Error("NO_MEMBERSHIP");

            return {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                avatarUrl: picture || user.avatarUrl,
                orgId: membership.orgId,
                role: membership.role,
            };
        }

        // New user — create user + org + membership
        const slug = this.generateSlug(name || email);

        const result = await prisma.$transaction(async (tx) => {
            const newUser = await tx.user.create({
                data: {
                    email,
                    fullName: name || null,
                    avatarUrl: picture || null,
                    provider: "GOOGLE",
                    emailVerified: true,
                }
            });

            const org = await tx.organization.create({
                data: { name: name || email.split("@")[0], slug }
            });

            const membership = await tx.membership.create({
                data: { userId: newUser.id, orgId: org.id, role: "OWNER" }
            });

            return { user: newUser, org, membership };
        });

        return {
            id: result.user.id,
            email: result.user.email,
            fullName: result.user.fullName,
            avatarUrl: result.user.avatarUrl,
            orgId: result.org.id,
            role: result.membership.role,
        };
    }

    // ── Email Verification ─────────────────────────────────────────────────

    static async verifyEmail(userId: string): Promise<void> {
        await prisma.user.update({
            where: { id: userId },
            data: { emailVerified: true }
        });
    }

    // ── Forgot / Reset Password ────────────────────────────────────────────

    static async forgotPassword(
        email: string,
        jwtSign: (payload: any) => Promise<string>
    ): Promise<void> {
        const user = await prisma.user.findUnique({ where: { email } });
        // Always return success (don't reveal if email exists)
        if (!user || !user.isActive) return;

        const token = await jwtSign({
            type: "password-reset",
            userId: user.id,
            exp: Math.floor(Date.now() / 1000) + 3600 // 1h
        });

        await EmailService.sendPasswordResetEmail(email, token);
    }

    static async resetPassword(userId: string, newPassword: string): Promise<void> {
        const passwordHash = await argon2.hash(newPassword, {
            type: argon2.argon2id,
            memoryCost: 4096,
            timeCost: 3
        });

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash }
        });
    }

    // ── Profile ────────────────────────────────────────────────────────────

    static async getProfile(userId: string, orgId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, email: true, fullName: true, avatarUrl: true,
                provider: true, emailVerified: true, createdAt: true,
                memberships: {
                    select: { orgId: true, role: true, org: { select: { id: true, name: true, slug: true } } }
                }
            }
        });
        if (!user) return null;

        const currentMembership = user.memberships.find(m => m.orgId === orgId);
        return { ...user, currentRole: currentMembership?.role ?? null };
    }

    static async updateProfile(userId: string, data: { fullName?: string; avatarUrl?: string }) {
        return prisma.user.update({
            where: { id: userId },
            data,
            select: { id: true, email: true, fullName: true, avatarUrl: true }
        });
    }

    // ── Account Management ───────────────────────────────────────────────

    static async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("USER_NOT_FOUND");

        if (user.passwordHash) {
            const valid = await argon2.verify(user.passwordHash, currentPassword);
            if (!valid) throw new Error("WRONG_PASSWORD");
        }

        const passwordHash = await argon2.hash(newPassword, {
            type: argon2.argon2id, memoryCost: 4096, timeCost: 3
        });
        await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    }

    static async changeEmail(
        userId: string,
        newEmail: string,
        password: string,
        jwtSign: (payload: any) => Promise<string>
    ): Promise<void> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("USER_NOT_FOUND");

        // Require password verification
        if (!user.passwordHash) throw new Error("NO_PASSWORD_SET");
        const valid = await argon2.verify(user.passwordHash, password);
        if (!valid) throw new Error("WRONG_PASSWORD");

        // Check email availability
        const existing = await prisma.user.findUnique({ where: { email: newEmail } });
        if (existing) throw new Error("EMAIL_EXISTS");

        await prisma.user.update({
            where: { id: userId },
            data: { email: newEmail, emailVerified: false }
        });

        // Send verification for new email
        const token = await jwtSign({
            type: "email-verify", userId, exp: Math.floor(Date.now() / 1000) + 86400
        });
        EmailService.sendVerificationEmail(newEmail, token).catch(console.error);
    }

    static async linkGoogle(userId: string, idToken: string): Promise<void> {
        const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!res.ok) throw new Error("INVALID_GOOGLE_TOKEN");

        const payload: any = await res.json();
        if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error("INVALID_GOOGLE_TOKEN");

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("USER_NOT_FOUND");

        // Check the Google email matches or is not taken by another user
        if (payload.email !== user.email) {
            const other = await prisma.user.findUnique({ where: { email: payload.email } });
            if (other) throw new Error("GOOGLE_EMAIL_TAKEN");
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                provider: "GOOGLE",
                avatarUrl: user.avatarUrl || payload.picture || null,
                emailVerified: true
            }
        });
    }

    static async unlinkGoogle(userId: string): Promise<void> {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("USER_NOT_FOUND");
        if (!user.passwordHash) throw new Error("SET_PASSWORD_FIRST");

        await prisma.user.update({
            where: { id: userId },
            data: { provider: "EMAIL" }
        });
    }

    // ── Switch Org ─────────────────────────────────────────────────────────

    static async switchOrg(userId: string, orgId: string): Promise<{ orgId: string; role: Role } | null> {
        const membership = await prisma.membership.findUnique({
            where: { userId_orgId: { userId, orgId } }
        });
        if (!membership) return null;
        return { orgId: membership.orgId, role: membership.role };
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static generateSlug(name: string): string {
        const base = name
            .toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40);
        const suffix = Math.random().toString(36).slice(2, 6);
        return `${base}-${suffix}`;
    }
}
