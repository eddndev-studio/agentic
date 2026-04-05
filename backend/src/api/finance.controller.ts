import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { handlePrismaError } from "../utils/prisma-errors";

export const financeController = new Elysia({ prefix: "/finance" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // ═══════════════════════════════════════════════════════════════════════
    // Workers
    // ═══════════════════════════════════════════════════════════════════════

    .get("/workers", async ({ query, user }) => {
        const where: any = { orgId: user!.orgId };
        if (query.active === "true") where.isActive = true;
        return prisma.worker.findMany({
            where,
            include: {
                adAccount: { select: { id: true, fbAccountId: true, name: true } },
                membership: { select: { id: true, role: true, user: { select: { id: true, email: true, fullName: true, avatarUrl: true } } } },
            },
            orderBy: { name: "asc" },
        });
    })

    .get("/workers/:id", async ({ params: { id }, set, user }) => {
        const worker = await prisma.worker.findFirst({
            where: { id, orgId: user!.orgId },
            include: {
                adAccount: { select: { id: true, fbAccountId: true, name: true } },
                membership: { select: { id: true, role: true, user: { select: { id: true, email: true, fullName: true, avatarUrl: true } } } },
                workerPeriods: { orderBy: { period: { startDate: "desc" } }, take: 5, include: { period: true } },
            },
        });
        if (!worker) { set.status = 404; return { error: "Not found" }; }
        return worker;
    })

    .post("/workers", async ({ body, set, user }) => {
        // Validate membership belongs to this org
        if (body.membershipId) {
            const membership = await prisma.membership.findFirst({
                where: { id: body.membershipId, orgId: user!.orgId },
            });
            if (!membership) { set.status = 400; return { error: "Membership not found in this organization" }; }

            // Check no existing Worker for this membership
            const existing = await prisma.worker.findUnique({ where: { membershipId: body.membershipId } });
            if (existing) { set.status = 409; return { error: "This member already has a worker profile" }; }
        }

        return prisma.worker.create({
            data: {
                name: body.name,
                baseSalary: body.baseSalary,
                bonusPercent: body.bonusPercent ?? 0,
                bonusMinLicenses: body.bonusMinLicenses ?? 0,
                membershipId: body.membershipId ?? null,
                orgId: user!.orgId,
            },
        });
    }, {
        body: t.Object({
            name: t.String(),
            baseSalary: t.Number(),
            bonusPercent: t.Optional(t.Number()),
            bonusMinLicenses: t.Optional(t.Number()),
            membershipId: t.Optional(t.String()),
        }),
    })

    .put("/workers/:id", async ({ params: { id }, body, set, user }) => {
        const existing = await prisma.worker.findFirst({ where: { id, orgId: user!.orgId } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        const data: Record<string, unknown> = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.baseSalary !== undefined) data.baseSalary = Number(body.baseSalary);
        if (body.bonusPercent !== undefined) data.bonusPercent = Number(body.bonusPercent);
        if (body.bonusMinLicenses !== undefined) data.bonusMinLicenses = Number(body.bonusMinLicenses);
        if (body.isActive !== undefined) data.isActive = body.isActive;
        if (body.membershipId !== undefined) {
            if (body.membershipId) {
                const membership = await prisma.membership.findFirst({ where: { id: body.membershipId, orgId: user!.orgId } });
                if (!membership) { set.status = 400; return { error: "Membership not found" }; }
            }
            data.membershipId = body.membershipId || null;
        }
        try {
            return await prisma.worker.update({ where: { id }, data });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            baseSalary: t.Optional(t.Number()),
            bonusPercent: t.Optional(t.Number()),
            bonusMinLicenses: t.Optional(t.Number()),
            isActive: t.Optional(t.Boolean()),
            membershipId: t.Optional(t.String()),
        }),
    })

    .delete("/workers/:id", async ({ params: { id }, set, user }) => {
        const existing = await prisma.worker.findFirst({ where: { id, orgId: user!.orgId } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        try {
            await prisma.worker.update({ where: { id }, data: { isActive: false } });
            return { success: true };
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Bank Accounts
    // ═══════════════════════════════════════════════════════════════════════

    .get("/bank-accounts", async ({ user }) => {
        return prisma.bankAccount.findMany({
            where: { isActive: true, orgId: user!.orgId },
            orderBy: { name: "asc" },
        });
    })

    .post("/bank-accounts", async ({ body, user }) => {
        return prisma.bankAccount.create({
            data: { name: body.name, bankName: body.bankName, identifier: body.identifier, orgId: user!.orgId },
        });
    }, {
        body: t.Object({
            name: t.String(),
            bankName: t.String(),
            identifier: t.String(),
        }),
    })

    .put("/bank-accounts/:id", async ({ params: { id }, body, set, user }) => {
        const existing = await prisma.bankAccount.findFirst({ where: { id, orgId: user!.orgId } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        const data: Record<string, unknown> = {};
        if (body.name !== undefined) data.name = body.name;
        if (body.bankName !== undefined) data.bankName = body.bankName;
        if (body.identifier !== undefined) data.identifier = body.identifier;
        if (body.isActive !== undefined) data.isActive = body.isActive;
        try {
            return await prisma.bankAccount.update({ where: { id }, data });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            name: t.Optional(t.String()),
            bankName: t.Optional(t.String()),
            identifier: t.Optional(t.String()),
            isActive: t.Optional(t.Boolean()),
        }),
    })

    .delete("/bank-accounts/:id", async ({ params: { id }, set, user }) => {
        const existing = await prisma.bankAccount.findFirst({ where: { id, orgId: user!.orgId } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        try {
            await prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
            return { success: true };
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Periods
    // ═══════════════════════════════════════════════════════════════════════

    .get("/periods", async ({ query, user }) => {
        const where: any = { orgId: user!.orgId };
        if (query.status) where.status = query.status;
        return prisma.financialPeriod.findMany({
            where,
            orderBy: { startDate: "desc" },
        });
    })

    .get("/periods/:id", async ({ params: { id }, set, user }) => {
        const period = await prisma.financialPeriod.findFirst({
            where: { id, orgId: user!.orgId },
            include: {
                incomes: { include: { worker: true, bankAccount: true }, orderBy: { date: "desc" } },
                expenses: { orderBy: { date: "desc" } },
                workerPeriods: { include: { worker: true }, orderBy: { worker: { name: "asc" } } },
            },
        });
        if (!period) { set.status = 404; return { error: "Not found" }; }
        return period;
    })

    .post("/periods", async ({ body, user }) => {
        const activeWorkers = await prisma.worker.findMany({ where: { isActive: true, orgId: user!.orgId }, select: { id: true } });
        const period = await prisma.financialPeriod.create({
            data: {
                type: body.type,
                startDate: new Date(body.startDate),
                endDate: new Date(body.endDate),
                orgId: user!.orgId,
                workerPeriods: {
                    create: activeWorkers.map(w => ({ workerId: w.id })),
                },
            },
            include: { workerPeriods: true },
        });
        return period;
    }, {
        body: t.Object({
            type: t.String(),
            startDate: t.String(),
            endDate: t.String(),
        }),
    })

    .post("/periods/:id/close", async ({ params: { id }, set, user }) => {
        const period = await prisma.financialPeriod.findFirst({
            where: { id, orgId: user!.orgId },
            include: { workerPeriods: { include: { worker: true } }, incomes: true },
        });
        if (!period) { set.status = 404; return { error: "Not found" }; }
        if (period.status === "CLOSED") { set.status = 400; return { error: "Period already closed" }; }

        // Find or create the next open period for debt carry-over
        const nextPeriod = await prisma.financialPeriod.findFirst({
            where: { status: "OPEN", startDate: { gt: period.endDate }, orgId: user!.orgId },
            orderBy: { startDate: "asc" },
        });

        const results: any[] = [];

        await prisma.$transaction(async (tx) => {
            for (const wp of period.workerPeriods) {
                // Calculate income for this worker in this period
                const income = period.incomes
                    .filter(i => i.workerId === wp.workerId)
                    .reduce((sum, i) => sum + i.amount, 0);

                // Calculate ad spend from insights
                const adSpendResult = await tx.adInsight.aggregate({
                    _sum: { spend: true },
                    where: {
                        level: "CAMPAIGN",
                        date: { gte: period.startDate, lte: period.endDate },
                        campaign: { adAccount: { workerId: wp.workerId } },
                    },
                });
                const adSpend = adSpendResult._sum.spend || 0;

                // Calculate salary (prorate for weekly)
                const salary = period.type === "WEEKLY"
                    ? wp.worker.baseSalary / 4.33
                    : wp.worker.baseSalary;

                const totalCost = salary + adSpend + wp.debtCarryOver;
                const balance = income - totalCost;

                // Bonus
                const bonus = (balance >= 0 && wp.licenseSales >= wp.worker.bonusMinLicenses)
                    ? balance * (wp.worker.bonusPercent / 100)
                    : 0;

                results.push({
                    worker: wp.worker.name,
                    income,
                    adSpend,
                    salary,
                    debtCarryOver: wp.debtCarryOver,
                    totalCost,
                    balance,
                    bonus,
                    licenseSales: wp.licenseSales,
                });

                // Carry debt to next period
                if (balance < 0 && nextPeriod) {
                    await tx.workerPeriod.upsert({
                        where: { workerId_periodId: { workerId: wp.workerId, periodId: nextPeriod.id } },
                        create: { workerId: wp.workerId, periodId: nextPeriod.id, debtCarryOver: Math.abs(balance) },
                        update: { debtCarryOver: Math.abs(balance) },
                    });
                }
            }

            // Close the period
            await tx.financialPeriod.update({ where: { id }, data: { status: "CLOSED" } });
        });

        return { status: "CLOSED", results };
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Incomes
    // ═══════════════════════════════════════════════════════════════════════

    .get("/incomes", async ({ query, user }) => {
        const where: any = { period: { orgId: user!.orgId } };
        if (query.periodId) where.periodId = query.periodId;
        if (query.workerId) where.workerId = query.workerId;
        if (query.bankAccountId) where.bankAccountId = query.bankAccountId;
        return prisma.income.findMany({
            where,
            include: { worker: true, bankAccount: true },
            orderBy: { date: "desc" },
        });
    })

    .post("/incomes", async ({ body, set, user }) => {
        const period = await prisma.financialPeriod.findFirst({ where: { id: body.periodId, orgId: user!.orgId } });
        if (!period || period.status !== "OPEN") {
            set.status = 400;
            return { error: "Period is not open" };
        }
        return prisma.income.create({
            data: {
                amount: body.amount,
                bankAccountId: body.bankAccountId,
                workerId: body.workerId,
                periodId: body.periodId,
                date: new Date(body.date),
                notes: body.notes || null,
            },
            include: { worker: true, bankAccount: true },
        });
    }, {
        body: t.Object({
            amount: t.Number(),
            bankAccountId: t.String(),
            workerId: t.String(),
            periodId: t.String(),
            date: t.String(),
            notes: t.Optional(t.String()),
        }),
    })

    .put("/incomes/:id", async ({ params: { id }, body, set, user }) => {
        const existing = await prisma.income.findFirst({ where: { id, period: { orgId: user!.orgId } } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        const data: Record<string, unknown> = {};
        if (body.amount !== undefined) data.amount = Number(body.amount);
        if (body.bankAccountId !== undefined) data.bankAccountId = body.bankAccountId;
        if (body.workerId !== undefined) data.workerId = body.workerId;
        if (body.date !== undefined) data.date = new Date(body.date);
        if (body.notes !== undefined) data.notes = body.notes;
        try {
            return await prisma.income.update({ where: { id }, data, include: { worker: true, bankAccount: true } });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            amount: t.Optional(t.Number()),
            bankAccountId: t.Optional(t.String()),
            workerId: t.Optional(t.String()),
            date: t.Optional(t.String()),
            notes: t.Optional(t.String()),
        }),
    })

    .delete("/incomes/:id", async ({ params: { id }, set, user }) => {
        const existing = await prisma.income.findFirst({ where: { id, period: { orgId: user!.orgId } } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        try {
            await prisma.income.delete({ where: { id } });
            return { success: true };
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Expenses
    // ═══════════════════════════════════════════════════════════════════════

    .get("/expenses", async ({ query, user }) => {
        const where: any = { period: { orgId: user!.orgId } };
        if (query.periodId) where.periodId = query.periodId;
        return prisma.expense.findMany({
            where,
            orderBy: { date: "desc" },
        });
    })

    .post("/expenses", async ({ body, set, user }) => {
        const period = await prisma.financialPeriod.findFirst({ where: { id: body.periodId, orgId: user!.orgId } });
        if (!period || period.status !== "OPEN") {
            set.status = 400;
            return { error: "Period is not open" };
        }
        return prisma.expense.create({
            data: { description: body.description, amount: body.amount, periodId: body.periodId, date: new Date(body.date) },
        });
    }, {
        body: t.Object({
            description: t.String(),
            amount: t.Number(),
            periodId: t.String(),
            date: t.String(),
        }),
    })

    .put("/expenses/:id", async ({ params: { id }, body, set, user }) => {
        const existing = await prisma.expense.findFirst({ where: { id, period: { orgId: user!.orgId } } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        const data: Record<string, unknown> = {};
        if (body.description !== undefined) data.description = body.description;
        if (body.amount !== undefined) data.amount = Number(body.amount);
        if (body.date !== undefined) data.date = new Date(body.date);
        try {
            return await prisma.expense.update({ where: { id }, data });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            description: t.Optional(t.String()),
            amount: t.Optional(t.Number()),
            date: t.Optional(t.String()),
        }),
    })

    .delete("/expenses/:id", async ({ params: { id }, set, user }) => {
        const existing = await prisma.expense.findFirst({ where: { id, period: { orgId: user!.orgId } } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        try {
            await prisma.expense.delete({ where: { id } });
            return { success: true };
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Worker Periods
    // ═══════════════════════════════════════════════════════════════════════

    .get("/worker-periods", async ({ query, user }) => {
        const where: any = { period: { orgId: user!.orgId } };
        if (query.periodId) where.periodId = query.periodId;
        return prisma.workerPeriod.findMany({
            where,
            include: { worker: true, period: true },
            orderBy: { worker: { name: "asc" } },
        });
    })

    .put("/worker-periods/:id", async ({ params: { id }, body, set, user }) => {
        const existing = await prisma.workerPeriod.findFirst({ where: { id, period: { orgId: user!.orgId } } });
        if (!existing) { set.status = 404; return { error: "Not found" }; }
        const data: Record<string, unknown> = {};
        if (body.licenseSales !== undefined) data.licenseSales = Number(body.licenseSales);
        if (body.debtCarryOver !== undefined) data.debtCarryOver = Number(body.debtCarryOver);
        try {
            return await prisma.workerPeriod.update({ where: { id }, data, include: { worker: true } });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    }, {
        body: t.Object({
            licenseSales: t.Optional(t.Number()),
            debtCarryOver: t.Optional(t.Number()),
        }),
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Dashboard & Reports
    // ═══════════════════════════════════════════════════════════════════════

    .get("/dashboard", async ({ query, set, user }) => {
        // Find period (by id or latest open)
        let period;
        if (query.periodId) {
            period = await prisma.financialPeriod.findFirst({ where: { id: query.periodId, orgId: user!.orgId } });
        } else {
            period = await prisma.financialPeriod.findFirst({ where: { status: "OPEN", orgId: user!.orgId }, orderBy: { startDate: "desc" } });
        }
        if (!period) { set.status = 404; return { error: "No period found" }; }

        const totalIncome = (await prisma.income.aggregate({
            _sum: { amount: true },
            where: { periodId: period.id },
        }))._sum.amount || 0;

        const activeWorkers = await prisma.worker.findMany({ where: { isActive: true, orgId: user!.orgId } });
        const totalSalaries = activeWorkers.reduce((sum, w) => {
            return sum + (period.type === "WEEKLY" ? w.baseSalary / 4.33 : w.baseSalary);
        }, 0);

        const totalAdSpend = (await prisma.adInsight.aggregate({
            _sum: { spend: true },
            where: {
                level: "CAMPAIGN",
                date: { gte: period.startDate, lte: period.endDate },
            },
        }))._sum.spend || 0;

        const totalExpenses = (await prisma.expense.aggregate({
            _sum: { amount: true },
            where: { periodId: period.id },
        }))._sum.amount || 0;

        const totalInvestment = totalSalaries + totalAdSpend + totalExpenses;
        const target = totalInvestment * 1.30;
        const progress = target > 0 ? (totalIncome / target) * 100 : 0;
        const pureProfit = Math.max(0, totalIncome - target);

        return {
            period,
            totalIncome,
            totalSalaries,
            totalAdSpend,
            totalExpenses,
            totalInvestment,
            target,
            progress,
            pureProfit,
            reachedTarget: totalIncome >= target,
        };
    })

    .get("/dashboard/reports/workers", async ({ query, set, user }) => {
        let period;
        if (query.periodId) {
            period = await prisma.financialPeriod.findFirst({ where: { id: query.periodId, orgId: user!.orgId } });
        } else {
            period = await prisma.financialPeriod.findFirst({ where: { status: "OPEN", orgId: user!.orgId }, orderBy: { startDate: "desc" } });
        }
        if (!period) { set.status = 404; return { error: "No period found" }; }

        const workerPeriods = await prisma.workerPeriod.findMany({
            where: { periodId: period.id },
            include: { worker: { include: { adAccount: true } } },
        });

        const report = await Promise.all(workerPeriods.map(async (wp) => {
            const income = (await prisma.income.aggregate({
                _sum: { amount: true },
                where: { workerId: wp.workerId, periodId: period!.id },
            }))._sum.amount || 0;

            const adSpend = (await prisma.adInsight.aggregate({
                _sum: { spend: true },
                where: {
                    level: "CAMPAIGN",
                    date: { gte: period!.startDate, lte: period!.endDate },
                    campaign: { adAccount: { workerId: wp.workerId } },
                },
            }))._sum.spend || 0;

            const salary = period!.type === "WEEKLY" ? wp.worker.baseSalary / 4.33 : wp.worker.baseSalary;
            const totalCost = salary + adSpend + wp.debtCarryOver;
            const balance = income - totalCost;
            const bonus = (balance >= 0 && wp.licenseSales >= wp.worker.bonusMinLicenses)
                ? balance * (wp.worker.bonusPercent / 100)
                : 0;

            return {
                workerId: wp.workerId,
                workerName: wp.worker.name,
                income,
                adSpend,
                salary,
                debtCarryOver: wp.debtCarryOver,
                totalCost,
                balance,
                licenseSales: wp.licenseSales,
                bonus,
                adAccountName: wp.worker.adAccount?.name || null,
            };
        }));

        return { period, report };
    })

    .get("/dashboard/reports/summary", async ({ query, set, user }) => {
        let period;
        if (query.periodId) {
            period = await prisma.financialPeriod.findFirst({ where: { id: query.periodId, orgId: user!.orgId } });
        } else {
            period = await prisma.financialPeriod.findFirst({ where: { status: "OPEN", orgId: user!.orgId }, orderBy: { startDate: "desc" } });
        }
        if (!period) { set.status = 404; return { error: "No period found" }; }

        const totalIncome = (await prisma.income.aggregate({ _sum: { amount: true }, where: { periodId: period.id } }))._sum.amount || 0;
        const activeWorkers = await prisma.worker.findMany({ where: { isActive: true, orgId: user!.orgId } });
        const totalSalaries = activeWorkers.reduce((s, w) => s + (period.type === "WEEKLY" ? w.baseSalary / 4.33 : w.baseSalary), 0);
        const totalAdSpend = (await prisma.adInsight.aggregate({ _sum: { spend: true }, where: { level: "CAMPAIGN", date: { gte: period.startDate, lte: period.endDate } } }))._sum.spend || 0;
        const totalExpenses = (await prisma.expense.aggregate({ _sum: { amount: true }, where: { periodId: period.id } }))._sum.amount || 0;
        const totalInvestment = totalSalaries + totalAdSpend + totalExpenses;
        const netProfit = totalIncome - totalInvestment;
        const netMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

        // Income per bank account
        const incomeByBank = await prisma.income.groupBy({
            by: ["bankAccountId"],
            _sum: { amount: true },
            where: { periodId: period.id },
        });
        const bankAccounts = await prisma.bankAccount.findMany({ where: { id: { in: incomeByBank.map(i => i.bankAccountId) } } });
        const incomeByBankNamed = incomeByBank.map(i => ({
            bankAccount: bankAccounts.find(b => b.id === i.bankAccountId)?.name || "Unknown",
            amount: i._sum.amount || 0,
        }));

        return {
            period,
            totalIncome,
            totalSalaries,
            totalAdSpend,
            totalExpenses,
            totalInvestment,
            netProfit,
            netMargin,
            incomeByBank: incomeByBankNamed,
        };
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Facebook Connection & Ad Accounts
    // ═══════════════════════════════════════════════════════════════════════

    .get("/facebook/connection", async ({ user }) => {
        const conn = await prisma.facebookConnection.findFirst({
            where: { orgId: user!.orgId },
            include: { adAccounts: { include: { worker: { select: { id: true, name: true } } } } },
        });
        if (!conn) return { connected: false };
        return {
            connected: true,
            fbUserName: conn.fbUserName,
            fbUserId: conn.fbUserId,
            tokenExpiry: conn.tokenExpiry,
            syncStatus: conn.syncStatus,
            lastSyncAt: conn.lastSyncAt,
            lastSyncError: conn.lastSyncError,
            adAccounts: conn.adAccounts.map(a => ({
                id: a.id,
                fbAccountId: a.fbAccountId,
                name: a.name,
                accountStatus: a.accountStatus,
                worker: a.worker,
                lastSyncAt: a.lastSyncAt,
            })),
        };
    })

    .post("/facebook/connect", async ({ body, set }) => {
        const { FacebookService } = await import("../services/facebook.service");

        try {
            const result = await FacebookService.connect(body.shortLivedToken, body.fbUserId, body.fbUserName);
            return result;
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed to connect Facebook" };
        }
    }, {
        body: t.Object({
            shortLivedToken: t.String(),
            fbUserId: t.String(),
            fbUserName: t.String(),
        }),
    })

    .post("/facebook/disconnect", async ({ user }) => {
        await prisma.facebookConnection.deleteMany({ where: { orgId: user!.orgId } });
        return { success: true };
    })

    .get("/facebook/ad-accounts", async ({ user }) => {
        return prisma.adAccount.findMany({
            where: { connection: { orgId: user!.orgId } },
            include: { worker: { select: { id: true, name: true } } },
            orderBy: { name: "asc" },
        });
    })

    .put("/facebook/ad-accounts/:id/assign", async ({ params: { id }, body, set, user }) => {
        const adAccount = await prisma.adAccount.findFirst({ where: { id, connection: { orgId: user!.orgId } } });
        if (!adAccount) { set.status = 404; return { error: "Not found" }; }
        try {
            return await prisma.adAccount.update({
                where: { id },
                data: { workerId: body.workerId },
                include: { worker: { select: { id: true, name: true } } },
            });
        } catch (e: unknown) {
            set.status = 400;
            const msg = e instanceof Error ? e.message : "";
            return { error: msg.includes("Unique") ? "Worker already assigned to another ad account" : "Failed to assign" };
        }
    }, {
        body: t.Object({ workerId: t.String() }),
    })

    .put("/facebook/ad-accounts/:id/unassign", async ({ params: { id }, set, user }) => {
        const adAccount = await prisma.adAccount.findFirst({ where: { id, connection: { orgId: user!.orgId } } });
        if (!adAccount) { set.status = 404; return { error: "Not found" }; }
        try {
            return await prisma.adAccount.update({ where: { id }, data: { workerId: null } });
        } catch (e: unknown) {
            const [status, body] = handlePrismaError(e, "Finance");
            set.status = status;
            return body;
        }
    })

    .post("/facebook/sync", async ({ set }) => {
        const { FacebookService } = await import("../services/facebook.service");
        try {
            await FacebookService.syncAll();
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Sync failed" };
        }
    })

    .get("/facebook/sync-status", async ({ user }) => {
        const conn = await prisma.facebookConnection.findFirst({
            where: { orgId: user!.orgId },
            select: { syncStatus: true, lastSyncAt: true, lastSyncError: true, tokenExpiry: true },
        });
        if (!conn) return { connected: false };
        return {
            connected: true,
            syncStatus: conn.syncStatus,
            lastSyncAt: conn.lastSyncAt,
            lastSyncError: conn.lastSyncError,
            tokenExpiry: conn.tokenExpiry,
        };
    })

    .get("/facebook/campaigns", async ({ query, user }) => {
        const where: any = { adAccount: { connection: { orgId: user!.orgId } } };
        if (query.adAccountId) where.adAccountId = query.adAccountId;
        return prisma.campaign.findMany({
            where,
            include: { adAccount: { select: { id: true, name: true, fbAccountId: true } } },
            orderBy: { name: "asc" },
        });
    })

    .get("/facebook/campaigns/:id/adsets", async ({ params: { id }, user }) => {
        return prisma.adSet.findMany({
            where: { campaignId: id, campaign: { adAccount: { connection: { orgId: user!.orgId } } } },
            orderBy: { name: "asc" },
        });
    })

    .get("/facebook/adsets/:id/ads", async ({ params: { id }, user }) => {
        return prisma.ad.findMany({
            where: { adSetId: id, adSet: { campaign: { adAccount: { connection: { orgId: user!.orgId } } } } },
            orderBy: { name: "asc" },
        });
    })

    .get("/facebook/insights", async ({ query, user }) => {
        const where: any = { campaign: { adAccount: { connection: { orgId: user!.orgId } } } };
        if (query.level) where.level = query.level;
        if (query.since && query.until) {
            where.date = { gte: new Date(query.since as string), lte: new Date(query.until as string) };
        }
        if (query.adAccountId) {
            where.campaign = { ...where.campaign, adAccountId: query.adAccountId };
        }
        return prisma.adInsight.findMany({
            where,
            include: { campaign: { select: { id: true, name: true } } },
            orderBy: { date: "desc" },
            take: 500,
        });
    })

    .get("/facebook/worker-spend", async ({ query, user }) => {
        const dateFilter: any = {};
        if (query.since && query.until) {
            dateFilter.date = { gte: new Date(query.since as string), lte: new Date(query.until as string) };
        }

        const adAccounts = await prisma.adAccount.findMany({
            where: { workerId: { not: null }, connection: { orgId: user!.orgId } },
            include: { worker: { select: { id: true, name: true } } },
        });

        const result = await Promise.all(adAccounts.map(async (acc) => {
            const spend = (await prisma.adInsight.aggregate({
                _sum: { spend: true },
                where: { level: "CAMPAIGN", campaign: { adAccountId: acc.id }, ...dateFilter },
            }))._sum.spend || 0;

            return {
                workerId: acc.workerId,
                workerName: acc.worker?.name || "Unassigned",
                adAccountName: acc.name,
                fbAccountId: acc.fbAccountId,
                spend,
            };
        }));

        return result;
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Campaign Management (write operations)
    // ═══════════════════════════════════════════════════════════════════════

    .post("/facebook/campaigns/:id/status", async ({ params: { id }, body, set }) => {
        if (!["ACTIVE", "PAUSED"].includes(body.status)) {
            set.status = 400;
            return { error: "status must be ACTIVE or PAUSED" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateCampaignStatus(id, body.status as "ACTIVE" | "PAUSED");
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, { body: t.Object({ status: t.String() }) })

    .post("/facebook/adsets/:id/status", async ({ params: { id }, body, set }) => {
        if (!["ACTIVE", "PAUSED"].includes(body.status)) {
            set.status = 400;
            return { error: "status must be ACTIVE or PAUSED" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateAdSetStatus(id, body.status as "ACTIVE" | "PAUSED");
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, { body: t.Object({ status: t.String() }) })

    .post("/facebook/ads/:id/status", async ({ params: { id }, body, set }) => {
        if (!["ACTIVE", "PAUSED"].includes(body.status)) {
            set.status = 400;
            return { error: "status must be ACTIVE or PAUSED" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateAdStatus(id, body.status as "ACTIVE" | "PAUSED");
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, { body: t.Object({ status: t.String() }) })

    .put("/facebook/campaigns/:id/name", async ({ params: { id }, body, set }) => {
        if (!body.name?.trim()) {
            set.status = 400;
            return { error: "Provide a campaign name" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateCampaignName(id, body.name.trim());
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, { body: t.Object({ name: t.String() }) })

    .put("/facebook/campaigns/:id/budget", async ({ params: { id }, body, set }) => {
        if (body.dailyBudget == null && body.lifetimeBudget == null) {
            set.status = 400;
            return { error: "Provide dailyBudget or lifetimeBudget" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateCampaignBudget(id, { dailyBudget: body.dailyBudget, lifetimeBudget: body.lifetimeBudget });
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, {
        body: t.Object({ dailyBudget: t.Optional(t.Number()), lifetimeBudget: t.Optional(t.Number()) }),
    })

    .put("/facebook/adsets/:id/budget", async ({ params: { id }, body, set }) => {
        if (body.dailyBudget == null && body.lifetimeBudget == null) {
            set.status = 400;
            return { error: "Provide dailyBudget or lifetimeBudget" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateAdSetBudget(id, { dailyBudget: body.dailyBudget, lifetimeBudget: body.lifetimeBudget });
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, {
        body: t.Object({ dailyBudget: t.Optional(t.Number()), lifetimeBudget: t.Optional(t.Number()) }),
    })

    .post("/facebook/campaigns/create", async ({ body, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.createCampaign(body.adAccountId, {
                name: body.name, objective: body.objective, status: body.status,
                specialAdCategories: body.specialAdCategories, buyingType: body.buyingType,
                dailyBudget: body.dailyBudget, lifetimeBudget: body.lifetimeBudget,
                startTime: body.startTime, endTime: body.endTime,
            });
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, {
        body: t.Object({
            adAccountId: t.String(),
            name: t.String(),
            objective: t.String(),
            status: t.Optional(t.String()),
            specialAdCategories: t.Optional(t.Array(t.String())),
            buyingType: t.Optional(t.String()),
            dailyBudget: t.Optional(t.Number()),
            lifetimeBudget: t.Optional(t.Number()),
            startTime: t.Optional(t.String()),
            endTime: t.Optional(t.String()),
        }),
    })

    .delete("/facebook/campaigns/:id", async ({ params: { id }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            await FacebookService.deleteCampaign(id);
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // AdSet & Ad Management
    // ═══════════════════════════════════════════════════════════════════════

    .post("/facebook/adsets/create", async ({ body, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.createAdSet(body.campaignId, {
                name: body.name, status: body.status, targeting: body.targeting,
                dailyBudget: body.dailyBudget, lifetimeBudget: body.lifetimeBudget,
                billingEvent: body.billingEvent, optimizationGoal: body.optimizationGoal,
                bidAmount: body.bidAmount, startTime: body.startTime, endTime: body.endTime,
            });
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, {
        body: t.Object({
            campaignId: t.String(),
            name: t.String(),
            targeting: t.Any(),
            status: t.Optional(t.String()),
            dailyBudget: t.Optional(t.Number()),
            lifetimeBudget: t.Optional(t.Number()),
            billingEvent: t.Optional(t.String()),
            optimizationGoal: t.Optional(t.String()),
            bidAmount: t.Optional(t.Number()),
            startTime: t.Optional(t.String()),
            endTime: t.Optional(t.String()),
        }),
    })

    .delete("/facebook/adsets/:id", async ({ params: { id }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            await FacebookService.deleteAdSet(id);
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    .post("/facebook/ads/create", async ({ body, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.createAd(body.adSetId, { name: body.name, status: body.status, creative: body.creative });
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, {
        body: t.Object({
            adSetId: t.String(),
            name: t.String(),
            status: t.Optional(t.String()),
            creative: t.Any(),
        }),
    })

    .delete("/facebook/ads/:id", async ({ params: { id }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            await FacebookService.deleteAd(id);
            return { success: true };
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    .get("/facebook/interests", async ({ query, set }) => {
        const q = query.q as string;
        if (!q || q.length < 2) {
            set.status = 400;
            return { error: "Query must be at least 2 characters" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.searchInterests(q);
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    .get("/facebook/locations", async ({ query, set }) => {
        const q = query.q as string;
        if (!q || q.length < 2) {
            set.status = 400;
            return { error: "Query must be at least 2 characters" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.searchLocations(q);
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    .get("/facebook/pages", async ({ set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.getPages();
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    .get("/facebook/pages/:pageId/posts", async ({ params: { pageId }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.getPagePosts(pageId);
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Operation failed" };
        }
    })

    .post("/facebook/boost", async ({ body, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.boostPost(body.adAccountId, {
                postId: body.postId, pageId: body.pageId,
                dailyBudget: body.dailyBudget, duration: body.duration, targeting: body.targeting,
            });
        } catch (e: unknown) {
            set.status = 500;
            return { error: e instanceof Error ? e.message : "Failed" };
        }
    }, {
        body: t.Object({
            adAccountId: t.String(),
            postId: t.String(),
            pageId: t.String(),
            dailyBudget: t.Number(),
            duration: t.Number(),
            targeting: t.Optional(t.Any()),
        }),
    });
