import { prisma } from "../services/postgres.service";
import type { ClientStatus } from "@prisma/client";

/**
 * Controller for Client management.
 * Handler signatures use Elysia-compatible context shapes (typed via derive + guard).
 */
export const ClientController = {
    getAll: async ({ query, user }: { query: Record<string, string>; user: { id: string; orgId: string; role: string } | null }) => {
        const filters: Record<string, unknown> = { bot: { orgId: user!.orgId } };
        if (query.botId) filters.botId = query.botId;

        const clients = await prisma.client.findMany({
            where: filters,
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        return clients.map((c) => {
            const { encryptedPassword, ...rest } = c;
            return rest;
        });
    },

    getOne: async ({ params: { id }, user }: { params: { id: string }; user: { orgId: string } | null }) => {
        const client = await prisma.client.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
        });
        if (!client) return new Response("Not found", { status: 404 });
        const { encryptedPassword, ...rest } = client;
        return rest;
    },

    create: async ({ body, user }: { body: { email: string; phoneNumber: string; botId: string; curp?: string; status?: string }; user: { orgId: string } | null }) => {
        if (!body.email || !body.phoneNumber || !body.botId) {
            return new Response("Missing required fields: email, phoneNumber, botId", { status: 400 });
        }
        try {
            const bot = await prisma.bot.findFirst({ where: { id: body.botId, orgId: user!.orgId } });
            if (!bot) return new Response("Not found", { status: 404 });

            const newClient = await prisma.client.create({
                data: {
                    email: body.email,
                    phoneNumber: body.phoneNumber,
                    curp: body.curp || null,
                    status: (body.status as ClientStatus) || undefined,
                    botId: body.botId,
                },
            });
            const { encryptedPassword: _, ...rest } = newClient;
            return rest;
        } catch (error: unknown) {
            if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === 'P2002') {
                const meta = (error as Record<string, unknown>).meta as Record<string, unknown> | undefined;
                const field = (meta?.target as string[])?.[0] || 'email';
                return new Response(`Client with this ${field} already exists`, { status: 409 });
            }
            console.error("Error creating client:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    },

    update: async ({ params: { id }, body, user }: { params: { id: string }; body: Record<string, unknown>; user: { orgId: string } | null }) => {
        const existing = await prisma.client.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
        });
        if (!existing) return new Response("Not found", { status: 404 });

        try {
            const { plainTextPassword, botId, ...updateData } = body;
            const updated = await prisma.client.update({ where: { id }, data: updateData });
            const { encryptedPassword, ...rest } = updated;
            return rest;
        } catch (error) {
            console.error("Error updating client:", error);
            return new Response("Error updating client", { status: 500 });
        }
    },

    delete: async ({ params: { id }, user }: { params: { id: string }; user: { orgId: string } | null }) => {
        const existing = await prisma.client.findFirst({
            where: { id, bot: { orgId: user!.orgId } },
        });
        if (!existing) return new Response("Not found", { status: 404 });

        await prisma.client.delete({ where: { id } });
        return { success: true };
    },
};
