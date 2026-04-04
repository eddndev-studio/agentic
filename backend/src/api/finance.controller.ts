import { Elysia, t } from "elysia";
import { prisma } from "../services/postgres.service";
import { authMiddleware } from "../middleware/auth.middleware";

export const financeController = new Elysia({ prefix: "/finance" })
    .use(authMiddleware)
    .guard({ isSignIn: true })

    // ═══════════════════════════════════════════════════════════════════════
    // Workers
    // ═══════════════════════════════════════════════════════════════════════

    .get("/workers", async ({ query }) => {
        const where: any = {};
        if (query.active === "true") where.isActive = true;
        return prisma.worker.findMany({
            where,
            include: { adAccount: { select: { id: true, fbAccountId: true, name: true } } },
            orderBy: { name: "asc" },
        });
    })

    .get("/workers/:id", async ({ params: { id }, set }) => {
        const worker = await prisma.worker.findUnique({
            where: { id },
            include: {
                adAccount: { select: { id: true, fbAccountId: true, name: true } },
                workerPeriods: { orderBy: { period: { startDate: "desc" } }, take: 5, include: { period: true } },
            },
        });
        if (!worker) { set.status = 404; return { error: "Worker not found" }; }
        return worker;
    })

    .post("/workers", async ({ body }) => {
        return prisma.worker.create({
            data: {
                name: body.name,
                baseSalary: body.baseSalary,
                bonusPercent: body.bonusPercent ?? 0,
                bonusMinLicenses: body.bonusMinLicenses ?? 0,
            },
        });
    }, {
        body: t.Object({
            name: t.String(),
            baseSalary: t.Number(),
            bonusPercent: t.Optional(t.Number()),
            bonusMinLicenses: t.Optional(t.Number()),
        }),
    })

    .put("/workers/:id", async ({ params: { id }, body, set }) => {
        const { name, baseSalary, bonusPercent, bonusMinLicenses, isActive } = body as any;
        const data: any = {};
        if (name !== undefined) data.name = name;
        if (baseSalary !== undefined) data.baseSalary = Number(baseSalary);
        if (bonusPercent !== undefined) data.bonusPercent = Number(bonusPercent);
        if (bonusMinLicenses !== undefined) data.bonusMinLicenses = Number(bonusMinLicenses);
        if (isActive !== undefined) data.isActive = isActive;
        try {
            return await prisma.worker.update({ where: { id }, data });
        } catch {
            set.status = 404;
            return { error: "Worker not found" };
        }
    })

    .delete("/workers/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.worker.update({ where: { id }, data: { isActive: false } });
            return { success: true };
        } catch {
            set.status = 404;
            return { error: "Worker not found" };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Bank Accounts
    // ═══════════════════════════════════════════════════════════════════════

    .get("/bank-accounts", async () => {
        return prisma.bankAccount.findMany({
            where: { isActive: true },
            orderBy: { name: "asc" },
        });
    })

    .post("/bank-accounts", async ({ body }) => {
        return prisma.bankAccount.create({
            data: { name: body.name, bankName: body.bankName, identifier: body.identifier },
        });
    }, {
        body: t.Object({
            name: t.String(),
            bankName: t.String(),
            identifier: t.String(),
        }),
    })

    .put("/bank-accounts/:id", async ({ params: { id }, body, set }) => {
        const { name, bankName, identifier, isActive } = body as any;
        const data: any = {};
        if (name !== undefined) data.name = name;
        if (bankName !== undefined) data.bankName = bankName;
        if (identifier !== undefined) data.identifier = identifier;
        if (isActive !== undefined) data.isActive = isActive;
        try {
            return await prisma.bankAccount.update({ where: { id }, data });
        } catch {
            set.status = 404;
            return { error: "Bank account not found" };
        }
    })

    .delete("/bank-accounts/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.bankAccount.update({ where: { id }, data: { isActive: false } });
            return { success: true };
        } catch {
            set.status = 404;
            return { error: "Bank account not found" };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Periods
    // ═══════════════════════════════════════════════════════════════════════

    .get("/periods", async ({ query }) => {
        const where: any = {};
        if (query.status) where.status = query.status;
        return prisma.financialPeriod.findMany({
            where,
            orderBy: { startDate: "desc" },
        });
    })

    .get("/periods/:id", async ({ params: { id }, set }) => {
        const period = await prisma.financialPeriod.findUnique({
            where: { id },
            include: {
                incomes: { include: { worker: true, bankAccount: true }, orderBy: { date: "desc" } },
                expenses: { orderBy: { date: "desc" } },
                workerPeriods: { include: { worker: true }, orderBy: { worker: { name: "asc" } } },
            },
        });
        if (!period) { set.status = 404; return { error: "Period not found" }; }
        return period;
    })

    .post("/periods", async ({ body }) => {
        const activeWorkers = await prisma.worker.findMany({ where: { isActive: true }, select: { id: true } });
        const period = await prisma.financialPeriod.create({
            data: {
                type: body.type,
                startDate: new Date(body.startDate),
                endDate: new Date(body.endDate),
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

    .post("/periods/:id/close", async ({ params: { id }, set }) => {
        const period = await prisma.financialPeriod.findUnique({
            where: { id },
            include: { workerPeriods: { include: { worker: true } }, incomes: true },
        });
        if (!period) { set.status = 404; return { error: "Period not found" }; }
        if (period.status === "CLOSED") { set.status = 400; return { error: "Period already closed" }; }

        // Find or create the next open period for debt carry-over
        const nextPeriod = await prisma.financialPeriod.findFirst({
            where: { status: "OPEN", startDate: { gt: period.endDate } },
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

    .get("/incomes", async ({ query }) => {
        const where: any = {};
        if (query.periodId) where.periodId = query.periodId;
        if (query.workerId) where.workerId = query.workerId;
        if (query.bankAccountId) where.bankAccountId = query.bankAccountId;
        return prisma.income.findMany({
            where,
            include: { worker: true, bankAccount: true },
            orderBy: { date: "desc" },
        });
    })

    .post("/incomes", async ({ body, set }) => {
        const period = await prisma.financialPeriod.findUnique({ where: { id: body.periodId } });
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

    .put("/incomes/:id", async ({ params: { id }, body, set }) => {
        const { amount, bankAccountId, workerId, date, notes } = body as any;
        const data: any = {};
        if (amount !== undefined) data.amount = Number(amount);
        if (bankAccountId !== undefined) data.bankAccountId = bankAccountId;
        if (workerId !== undefined) data.workerId = workerId;
        if (date !== undefined) data.date = new Date(date);
        if (notes !== undefined) data.notes = notes;
        try {
            return await prisma.income.update({ where: { id }, data, include: { worker: true, bankAccount: true } });
        } catch {
            set.status = 404;
            return { error: "Income not found" };
        }
    })

    .delete("/incomes/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.income.delete({ where: { id } });
            return { success: true };
        } catch {
            set.status = 404;
            return { error: "Income not found" };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Expenses
    // ═══════════════════════════════════════════════════════════════════════

    .get("/expenses", async ({ query }) => {
        const where: any = {};
        if (query.periodId) where.periodId = query.periodId;
        return prisma.expense.findMany({
            where,
            orderBy: { date: "desc" },
        });
    })

    .post("/expenses", async ({ body, set }) => {
        const period = await prisma.financialPeriod.findUnique({ where: { id: body.periodId } });
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

    .put("/expenses/:id", async ({ params: { id }, body, set }) => {
        const { description, amount, date } = body as any;
        const data: any = {};
        if (description !== undefined) data.description = description;
        if (amount !== undefined) data.amount = Number(amount);
        if (date !== undefined) data.date = new Date(date);
        try {
            return await prisma.expense.update({ where: { id }, data });
        } catch {
            set.status = 404;
            return { error: "Expense not found" };
        }
    })

    .delete("/expenses/:id", async ({ params: { id }, set }) => {
        try {
            await prisma.expense.delete({ where: { id } });
            return { success: true };
        } catch {
            set.status = 404;
            return { error: "Expense not found" };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Worker Periods
    // ═══════════════════════════════════════════════════════════════════════

    .get("/worker-periods", async ({ query }) => {
        const where: any = {};
        if (query.periodId) where.periodId = query.periodId;
        return prisma.workerPeriod.findMany({
            where,
            include: { worker: true, period: true },
            orderBy: { worker: { name: "asc" } },
        });
    })

    .put("/worker-periods/:id", async ({ params: { id }, body, set }) => {
        const { licenseSales, debtCarryOver } = body as any;
        const data: any = {};
        if (licenseSales !== undefined) data.licenseSales = Number(licenseSales);
        if (debtCarryOver !== undefined) data.debtCarryOver = Number(debtCarryOver);
        try {
            return await prisma.workerPeriod.update({ where: { id }, data, include: { worker: true } });
        } catch {
            set.status = 404;
            return { error: "Worker period not found" };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // Dashboard & Reports
    // ═══════════════════════════════════════════════════════════════════════

    .get("/dashboard", async ({ query, set }) => {
        // Find period (by id or latest open)
        let period;
        if (query.periodId) {
            period = await prisma.financialPeriod.findUnique({ where: { id: query.periodId } });
        } else {
            period = await prisma.financialPeriod.findFirst({ where: { status: "OPEN" }, orderBy: { startDate: "desc" } });
        }
        if (!period) { set.status = 404; return { error: "No period found" }; }

        const totalIncome = (await prisma.income.aggregate({
            _sum: { amount: true },
            where: { periodId: period.id },
        }))._sum.amount || 0;

        const activeWorkers = await prisma.worker.findMany({ where: { isActive: true } });
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

    .get("/dashboard/reports/workers", async ({ query, set }) => {
        let period;
        if (query.periodId) {
            period = await prisma.financialPeriod.findUnique({ where: { id: query.periodId } });
        } else {
            period = await prisma.financialPeriod.findFirst({ where: { status: "OPEN" }, orderBy: { startDate: "desc" } });
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

    .get("/dashboard/reports/summary", async ({ query, set }) => {
        let period;
        if (query.periodId) {
            period = await prisma.financialPeriod.findUnique({ where: { id: query.periodId } });
        } else {
            period = await prisma.financialPeriod.findFirst({ where: { status: "OPEN" }, orderBy: { startDate: "desc" } });
        }
        if (!period) { set.status = 404; return { error: "No period found" }; }

        const totalIncome = (await prisma.income.aggregate({ _sum: { amount: true }, where: { periodId: period.id } }))._sum.amount || 0;
        const activeWorkers = await prisma.worker.findMany({ where: { isActive: true } });
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

    .get("/facebook/connection", async () => {
        const conn = await prisma.facebookConnection.findFirst({
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
        const { shortLivedToken, fbUserId, fbUserName } = body as any;
        if (!shortLivedToken || !fbUserId || !fbUserName) {
            set.status = 400;
            return { error: "shortLivedToken, fbUserId, and fbUserName are required" };
        }

        // Dynamic import to avoid circular deps
        const { FacebookService } = await import("../services/facebook.service");

        try {
            const result = await FacebookService.connect(shortLivedToken, fbUserId, fbUserName);
            return result;
        } catch (e: any) {
            set.status = 500;
            return { error: e.message || "Failed to connect Facebook" };
        }
    })

    .post("/facebook/disconnect", async () => {
        await prisma.facebookConnection.deleteMany();
        return { success: true };
    })

    .get("/facebook/ad-accounts", async () => {
        return prisma.adAccount.findMany({
            include: { worker: { select: { id: true, name: true } } },
            orderBy: { name: "asc" },
        });
    })

    .put("/facebook/ad-accounts/:id/assign", async ({ params: { id }, body, set }) => {
        const { workerId } = body as any;
        if (!workerId) { set.status = 400; return { error: "workerId is required" }; }
        try {
            return await prisma.adAccount.update({
                where: { id },
                data: { workerId },
                include: { worker: { select: { id: true, name: true } } },
            });
        } catch (e: any) {
            set.status = 400;
            return { error: e.message?.includes("Unique") ? "Worker already assigned to another ad account" : "Failed to assign" };
        }
    })

    .put("/facebook/ad-accounts/:id/unassign", async ({ params: { id }, set }) => {
        try {
            return await prisma.adAccount.update({ where: { id }, data: { workerId: null } });
        } catch {
            set.status = 404;
            return { error: "Ad account not found" };
        }
    })

    .post("/facebook/sync", async ({ set }) => {
        const { FacebookService } = await import("../services/facebook.service");
        try {
            await FacebookService.syncAll();
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message || "Sync failed" };
        }
    })

    .get("/facebook/sync-status", async () => {
        const conn = await prisma.facebookConnection.findFirst({
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

    .get("/facebook/campaigns", async ({ query }) => {
        const where: any = {};
        if (query.adAccountId) where.adAccountId = query.adAccountId;
        return prisma.campaign.findMany({
            where,
            include: { adAccount: { select: { id: true, name: true, fbAccountId: true } } },
            orderBy: { name: "asc" },
        });
    })

    .get("/facebook/campaigns/:id/adsets", async ({ params: { id } }) => {
        return prisma.adSet.findMany({
            where: { campaignId: id },
            orderBy: { name: "asc" },
        });
    })

    .get("/facebook/adsets/:id/ads", async ({ params: { id } }) => {
        return prisma.ad.findMany({
            where: { adSetId: id },
            orderBy: { name: "asc" },
        });
    })

    .get("/facebook/insights", async ({ query }) => {
        const where: any = {};
        if (query.level) where.level = query.level;
        if (query.since && query.until) {
            where.date = { gte: new Date(query.since as string), lte: new Date(query.until as string) };
        }
        if (query.adAccountId) {
            where.campaign = { adAccountId: query.adAccountId };
        }
        return prisma.adInsight.findMany({
            where,
            include: { campaign: { select: { id: true, name: true } } },
            orderBy: { date: "desc" },
            take: 500,
        });
    })

    .get("/facebook/worker-spend", async ({ query }) => {
        const dateFilter: any = {};
        if (query.since && query.until) {
            dateFilter.date = { gte: new Date(query.since as string), lte: new Date(query.until as string) };
        }

        const adAccounts = await prisma.adAccount.findMany({
            where: { workerId: { not: null } },
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
        const { status } = body as any;
        if (!status || !["ACTIVE", "PAUSED"].includes(status)) {
            set.status = 400;
            return { error: "status must be ACTIVE or PAUSED" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateCampaignStatus(id, status);
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .post("/facebook/adsets/:id/status", async ({ params: { id }, body, set }) => {
        const { status } = body as any;
        if (!status || !["ACTIVE", "PAUSED"].includes(status)) {
            set.status = 400;
            return { error: "status must be ACTIVE or PAUSED" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateAdSetStatus(id, status);
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .post("/facebook/ads/:id/status", async ({ params: { id }, body, set }) => {
        const { status } = body as any;
        if (!status || !["ACTIVE", "PAUSED"].includes(status)) {
            set.status = 400;
            return { error: "status must be ACTIVE or PAUSED" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateAdStatus(id, status);
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .put("/facebook/campaigns/:id/name", async ({ params: { id }, body, set }) => {
        const { name } = body as any;
        if (!name?.trim()) {
            set.status = 400;
            return { error: "Provide a campaign name" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateCampaignName(id, name.trim());
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .put("/facebook/campaigns/:id/budget", async ({ params: { id }, body, set }) => {
        const { dailyBudget, lifetimeBudget } = body as any;
        if (dailyBudget == null && lifetimeBudget == null) {
            set.status = 400;
            return { error: "Provide dailyBudget or lifetimeBudget" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateCampaignBudget(id, { dailyBudget, lifetimeBudget });
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .put("/facebook/adsets/:id/budget", async ({ params: { id }, body, set }) => {
        const { dailyBudget, lifetimeBudget } = body as any;
        if (dailyBudget == null && lifetimeBudget == null) {
            set.status = 400;
            return { error: "Provide dailyBudget or lifetimeBudget" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.updateAdSetBudget(id, { dailyBudget, lifetimeBudget });
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .post("/facebook/campaigns/create", async ({ body, set }) => {
        const { adAccountId, name, objective, status, specialAdCategories, buyingType, dailyBudget, lifetimeBudget, startTime, endTime } = body as any;
        if (!adAccountId || !name || !objective) {
            set.status = 400;
            return { error: "adAccountId, name, and objective are required" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.createCampaign(adAccountId, {
                name, objective, status, specialAdCategories, buyingType,
                dailyBudget, lifetimeBudget, startTime, endTime,
            });
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .delete("/facebook/campaigns/:id", async ({ params: { id }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            await FacebookService.deleteCampaign(id);
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    // ═══════════════════════════════════════════════════════════════════════
    // AdSet & Ad Management
    // ═══════════════════════════════════════════════════════════════════════

    .post("/facebook/adsets/create", async ({ body, set }) => {
        const { campaignId, name, targeting, dailyBudget, lifetimeBudget, billingEvent, optimizationGoal, bidAmount, startTime, endTime, status } = body as any;
        if (!campaignId || !name || !targeting) {
            set.status = 400;
            return { error: "campaignId, name, and targeting are required" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.createAdSet(campaignId, {
                name, status, targeting, dailyBudget, lifetimeBudget,
                billingEvent, optimizationGoal, bidAmount, startTime, endTime,
            });
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .delete("/facebook/adsets/:id", async ({ params: { id }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            await FacebookService.deleteAdSet(id);
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .post("/facebook/ads/create", async ({ body, set }) => {
        const { adSetId, name, status, creative } = body as any;
        if (!adSetId || !name || !creative) {
            set.status = 400;
            return { error: "adSetId, name, and creative are required" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.createAd(adSetId, { name, status, creative });
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .delete("/facebook/ads/:id", async ({ params: { id }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            await FacebookService.deleteAd(id);
            return { success: true };
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
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
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
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
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .get("/facebook/pages", async ({ set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.getPages();
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .get("/facebook/pages/:pageId/posts", async ({ params: { pageId }, set }) => {
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.getPagePosts(pageId);
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    })

    .post("/facebook/boost", async ({ body, set }) => {
        const { adAccountId, postId, pageId, dailyBudget, duration, targeting } = body as any;
        if (!adAccountId || !postId || !pageId || !dailyBudget || !duration) {
            set.status = 400;
            return { error: "adAccountId, postId, pageId, dailyBudget, and duration are required" };
        }
        try {
            const { FacebookService } = await import("../services/facebook.service");
            return await FacebookService.boostPost(adAccountId, { postId, pageId, dailyBudget, duration, targeting });
        } catch (e: any) {
            set.status = 500;
            return { error: e.message };
        }
    });
