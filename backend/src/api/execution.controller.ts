import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const executionController = new Elysia({ prefix: "/executions" })
    .use(authMiddleware)
    .guard({ isSignIn: true })
    .get("/", async ({ query, set, user }) => {
        const {
            botId,
            status,
            search,
            startDate,
            endDate,
            limit,
            offset
        } = query as {
            botId?: string;
            status?: string;
            search?: string;
            startDate?: string;
            endDate?: string;
            limit?: string;
            offset?: string;
        };

        // Filter executions via the flow relationship (Execution -> Flow -> Bot)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma dynamic where clause
        const where: any = { flow: { bot: { orgId: user!.orgId } } };

        if (botId) {
            where.flow = { ...where.flow, botId };
        }

        if (status && status !== 'ALL') {
            where.status = status;
        }

        if (search) {
            where.OR = [
                { platformUserId: { contains: search, mode: 'insensitive' } },
                { trigger: { contains: search, mode: 'insensitive' } },
                { flow: { name: { contains: search, mode: 'insensitive' } } }
            ];
        }

        if (startDate || endDate) {
            where.startedAt = {};
            if (startDate) where.startedAt.gte = new Date(startDate);
            if (endDate) where.startedAt.lte = new Date(endDate);
        }

        try {
            const take = Math.min(Math.max(parseInt(limit || "50") || 50, 1), 200);
            const skip = Math.max(parseInt(offset || "0") || 0, 0);

            const [total, executions] = await prisma.$transaction([
                prisma.execution.count({ where }),
                prisma.execution.findMany({
                    where,
                    take,
                    skip,
                    orderBy: { startedAt: 'desc' },
                    include: {
                        flow: {
                            select: { name: true, bot: { select: { id: true, name: true } } }
                        },
                        session: {
                            select: { name: true }
                        }
                    }
                })
            ]);

            return {
                data: executions,
                pagination: {
                    total,
                    limit: take,
                    offset: skip
                }
            };
        } catch (e: unknown) {
            set.status = 500;
            return { error: `Failed to fetch executions: ${e instanceof Error ? e.message : e}` };
        }
    });
