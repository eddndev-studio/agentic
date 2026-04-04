import { prisma } from "../services/postgres.service";

/**
 * Controller for Client management
 */
export const ClientController = {
    /**
     * Get all clients
     */
    getAll: async ({ query, user }: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped query
        const filters: any = { bot: { orgId: user!.orgId } };
        const q = query as Record<string, string | undefined>;

        if (q && q.botId) {
            filters.botId = q.botId;
        }

        const clients = await prisma.client.findMany({
            where: filters,
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        return clients.map((c: any) => {
            const { encryptedPassword, ...rest } = c;
            return rest;
        });
    },

    /**
     * Get single client by ID
     */
    getOne: async ({ params: { id }, user }: any) => {
        const client = await prisma.client.findFirst({
            where: { id: id as string, bot: { orgId: user!.orgId } }
        });

        if (!client) {
            return new Response("Not found", { status: 404 });
        }

        const { encryptedPassword, ...rest } = client;
        return rest;
    },

    /**
     * Create new client
     */
    create: async ({ body, user }: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body
        const data = body as any;

        if (!data.email || !data.phoneNumber || !data.botId) {
            return new Response("Missing required fields: email, phoneNumber, botId", { status: 400 });
        }

        try {
            const bot = await prisma.bot.findFirst({ where: { id: data.botId, orgId: user!.orgId } });
            if (!bot) {
                return new Response("Not found", { status: 404 });
            }

            const newClient = await prisma.client.create({
                data: {
                    email: data.email,
                    phoneNumber: data.phoneNumber,
                    curp: data.curp || null,
                    status: data.status || undefined,
                    botId: data.botId,
                }
            });

            const { encryptedPassword: _, ...rest } = newClient;
            return rest;

        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any -- Prisma error
            if (error.code === 'P2002') {
                const field = error.meta?.target?.[0] || 'email';
                return new Response(`Client with this ${field} already exists`, { status: 409 });
            }
            console.error("Error creating client:", error);
            return new Response("Internal Server Error", { status: 500 });
        }
    },

    /**
     * Update client
     */
    update: async ({ params: { id }, body, user }: any) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Elysia untyped body
        const data = body as any;

        // Verify client belongs to org
        const existing = await prisma.client.findFirst({
            where: { id: id as string, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            return new Response("Not found", { status: 404 });
        }

        try {
            const { plainTextPassword, botId, ...updateData } = data;

            const updated = await prisma.client.update({
                where: { id: id as string },
                data: updateData
            });

            const { encryptedPassword, ...rest } = updated;
            return rest;
        } catch (error) {
            console.error("Error updating client:", error);
            return new Response("Error updating client", { status: 500 });
        }
    },

    /**
     * Delete client
     */
    delete: async ({ params: { id }, user }: any) => {
        // Verify client belongs to org
        const existing = await prisma.client.findFirst({
            where: { id: id as string, bot: { orgId: user!.orgId } },
        });
        if (!existing) {
            return new Response("Not found", { status: 404 });
        }

        await prisma.client.delete({
            where: { id: id as string }
        });
        return { success: true };
    }
};
