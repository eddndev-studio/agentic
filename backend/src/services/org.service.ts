import { prisma } from "./postgres.service";
import { Role } from "@prisma/client";
import { EmailService } from "./email.service";

// ── Types ──────────────────────────────────────────────────────────────────

type MemberInfo = {
    id: string;
    userId: string;
    role: Role;
    createdAt: Date;
    user: { id: string; email: string; fullName: string | null; avatarUrl: string | null };
};

// ── Members ────────────────────────────────────────────────────────────────

export class OrgService {
    static async listMembers(orgId: string): Promise<MemberInfo[]> {
        return prisma.membership.findMany({
            where: { orgId },
            include: {
                user: { select: { id: true, email: true, fullName: true, avatarUrl: true } }
            },
            orderBy: { createdAt: "asc" }
        });
    }

    static async updateMemberRole(orgId: string, membershipId: string, newRole: Role) {
        const membership = await prisma.membership.findFirst({
            where: { id: membershipId, orgId }
        });
        if (!membership) throw new Error("MEMBER_NOT_FOUND");
        if (membership.role === "OWNER") throw new Error("CANNOT_CHANGE_OWNER_ROLE");
        if (newRole === "OWNER") throw new Error("USE_TRANSFER_OWNERSHIP");

        return prisma.membership.update({
            where: { id: membershipId },
            data: { role: newRole },
            include: {
                user: { select: { id: true, email: true, fullName: true, avatarUrl: true } }
            }
        });
    }

    static async removeMember(orgId: string, membershipId: string) {
        const membership = await prisma.membership.findFirst({
            where: { id: membershipId, orgId }
        });
        if (!membership) throw new Error("MEMBER_NOT_FOUND");
        if (membership.role === "OWNER") throw new Error("CANNOT_REMOVE_OWNER");

        // Remove worker bot assignments first, then membership
        await prisma.$transaction([
            prisma.workerBot.deleteMany({ where: { membershipId } }),
            prisma.membership.delete({ where: { id: membershipId } })
        ]);
    }

    // ── Invitations ────────────────────────────────────────────────────────

    static async listInvitations(orgId: string) {
        return prisma.invitation.findMany({
            where: { orgId, acceptedAt: null },
            orderBy: { createdAt: "desc" }
        });
    }

    static async createInvitation(orgId: string, email: string, role: Role) {
        if (role === "OWNER") throw new Error("CANNOT_INVITE_AS_OWNER");

        // Check if already a member
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            const existingMembership = await prisma.membership.findUnique({
                where: { userId_orgId: { userId: existingUser.id, orgId } }
            });
            if (existingMembership) throw new Error("ALREADY_MEMBER");
        }

        // Check for pending invitation
        const pendingInvite = await prisma.invitation.findFirst({
            where: { orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } }
        });
        if (pendingInvite) throw new Error("INVITATION_PENDING");

        const invitation = await prisma.invitation.create({
            data: {
                orgId,
                email,
                role,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
            }
        });

        // Send email (non-blocking)
        const org = await prisma.organization.findUnique({ where: { id: orgId } });
        EmailService.sendInvitationEmail(email, org?.name ?? "Agentic", invitation.token)
            .catch(console.error);

        return invitation;
    }

    static async cancelInvitation(orgId: string, invitationId: string) {
        const invitation = await prisma.invitation.findFirst({
            where: { id: invitationId, orgId }
        });
        if (!invitation) throw new Error("INVITATION_NOT_FOUND");

        await prisma.invitation.delete({ where: { id: invitationId } });
    }

    static async acceptInvitation(
        token: string,
        userId: string | null,
        newUser?: { email: string; password: string; fullName: string }
    ) {
        const invitation = await prisma.invitation.findUnique({ where: { token } });
        if (!invitation) throw new Error("INVITATION_NOT_FOUND");
        if (invitation.acceptedAt) throw new Error("INVITATION_ALREADY_ACCEPTED");
        if (invitation.expiresAt < new Date()) throw new Error("INVITATION_EXPIRED");

        const argon2 = await import("argon2");

        return prisma.$transaction(async (tx) => {
            // Create user if needed
            let finalUserId = userId;
            if (!finalUserId && newUser) {
                const passwordHash = await argon2.hash(newUser.password, {
                    type: argon2.argon2id, memoryCost: 4096, timeCost: 3
                });
                const user = await tx.user.create({
                    data: {
                        email: newUser.email,
                        passwordHash,
                        fullName: newUser.fullName,
                        emailVerified: true
                    }
                });
                finalUserId = user.id;
            }

            if (!finalUserId) throw new Error("USER_REQUIRED");

            // Create membership
            const membership = await tx.membership.create({
                data: {
                    userId: finalUserId,
                    orgId: invitation.orgId,
                    role: invitation.role
                }
            });

            // Mark invitation as accepted
            await tx.invitation.update({
                where: { id: invitation.id },
                data: { acceptedAt: new Date() }
            });

            return membership;
        });
    }

    // ── Transfer Ownership ─────────────────────────────────────────────────

    static async transferOwnership(orgId: string, currentOwnerId: string, newOwnerId: string) {
        const currentOwner = await prisma.membership.findFirst({
            where: { orgId, userId: currentOwnerId, role: "OWNER" }
        });
        if (!currentOwner) throw new Error("NOT_OWNER");

        const newOwner = await prisma.membership.findFirst({
            where: { orgId, userId: newOwnerId }
        });
        if (!newOwner) throw new Error("TARGET_NOT_MEMBER");

        await prisma.$transaction([
            prisma.membership.update({
                where: { id: currentOwner.id },
                data: { role: "ADMIN" }
            }),
            prisma.membership.update({
                where: { id: newOwner.id },
                data: { role: "OWNER" }
            })
        ]);
    }

    // ── Worker Bot Assignments ─────────────────────────────────────────────

    static async getWorkerBots(orgId: string, membershipId: string) {
        const membership = await prisma.membership.findFirst({
            where: { id: membershipId, orgId },
            include: {
                workerBots: {
                    include: { bot: { select: { id: true, name: true, identifier: true, platform: true } } }
                }
            }
        });
        if (!membership) throw new Error("MEMBER_NOT_FOUND");

        return membership.workerBots.map(wb => wb.bot);
    }

    static async setWorkerBots(orgId: string, membershipId: string, botIds: string[]) {
        const membership = await prisma.membership.findFirst({
            where: { id: membershipId, orgId }
        });
        if (!membership) throw new Error("MEMBER_NOT_FOUND");

        // Verify all bots belong to this org
        const bots = await prisma.bot.findMany({
            where: { id: { in: botIds }, orgId },
            select: { id: true }
        });
        if (bots.length !== botIds.length) throw new Error("INVALID_BOT_IDS");

        // Replace all assignments in a transaction
        await prisma.$transaction([
            prisma.workerBot.deleteMany({ where: { membershipId } }),
            ...botIds.map(botId =>
                prisma.workerBot.create({ data: { membershipId, botId } })
            )
        ]);

        return bots;
    }
}
