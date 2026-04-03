import { prisma } from "./postgres.service";
import { EncryptionService } from "./encryption.service";
import { config } from "../config";
import { createLogger } from "../logger";

const log = createLogger("FacebookService");
const GRAPH_URL = "https://graph.facebook.com/v21.0";

interface FbTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

const toCents = (n: number) => Math.round(n * 100);
const fromCents = (n: number) => n / 100;

export class FacebookService {

    // ── Token helper ────────────────────────────────────────────────────

    static async getDecryptedToken(): Promise<{ token: string; connection: any }> {
        const connection = await prisma.facebookConnection.findFirst();
        if (!connection) throw new Error("No Facebook connection found");

        const token = EncryptionService.decrypt(connection.accessToken);
        const valid = await this.validateToken(token);
        if (!valid) {
            await prisma.facebookConnection.update({
                where: { id: connection.id },
                data: { syncStatus: "TOKEN_EXPIRED", lastSyncError: "Token validation failed" },
            });
            throw new Error("Facebook token expired or invalid. Please reconnect.");
        }
        return { token, connection };
    }

    // ── Graph API helpers ───────────────────────────────────────────────

    private static async fbGet(token: string, path: string): Promise<any> {
        const separator = path.includes("?") ? "&" : "?";
        const url = `${GRAPH_URL}${path}${separator}access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(data.error.error_user_title || data.error.message || JSON.stringify(data.error));
        }
        return data;
    }

    private static async fbPost(token: string, path: string, params: Record<string, any>): Promise<any> {
        const body = new URLSearchParams();
        body.append("access_token", token);
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null) continue;
            body.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
        }
        const url = `${GRAPH_URL}${path}`;
        const res = await fetch(url, { method: "POST", body });
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(data.error.error_user_title || data.error.message || JSON.stringify(data.error));
        }
        return data;
    }

    private static async fbDelete(token: string, path: string): Promise<any> {
        const url = `${GRAPH_URL}${path}?access_token=${token}`;
        const res = await fetch(url, { method: "DELETE" });
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(data.error.error_user_title || data.error.message || JSON.stringify(data.error));
        }
        return data;
    }

    // ── Connection ──────────────────────────────────────────────────────

    static async connect(shortLivedToken: string, fbUserId: string, fbUserName: string) {
        const url = `${GRAPH_URL}/oauth/access_token?grant_type=fb_exchange_token`
            + `&client_id=${config.facebook.appId}`
            + `&client_secret=${config.facebook.appSecret}`
            + `&fb_exchange_token=${shortLivedToken}`;

        const res = await fetch(url);
        const data = await res.json() as FbTokenResponse & { error?: { message: string } };

        if (data.error) {
            throw new Error(`Facebook token exchange failed: ${data.error.message}`);
        }

        const longLivedToken = data.access_token;
        const expiresIn = data.expires_in || 5184000;
        const tokenExpiry = new Date(Date.now() + expiresIn * 1000);
        const encrypted = EncryptionService.encrypt(longLivedToken);

        const connection = await prisma.facebookConnection.upsert({
            where: { fbUserId },
            create: { accessToken: encrypted, tokenExpiry, fbUserId, fbUserName, syncStatus: "OK" },
            update: { accessToken: encrypted, tokenExpiry, fbUserName, syncStatus: "OK", lastSyncError: null },
        });

        const adAccountsRes = await this.fbGet(longLivedToken, "/me/adaccounts?fields=id,name,account_status&limit=50");
        const adAccounts = (adAccountsRes.data || []).filter((a: any) => a.account_status === 1);

        for (const acc of adAccounts) {
            await prisma.adAccount.upsert({
                where: { fbAccountId: acc.id },
                create: { fbAccountId: acc.id, name: acc.name, accountStatus: acc.account_status, connectionId: connection.id },
                update: { name: acc.name, accountStatus: acc.account_status, connectionId: connection.id },
            });
        }

        return { connected: true, fbUserName, tokenExpiry, adAccountCount: adAccounts.length };
    }

    // ── Status Management ───────────────────────────────────────────────

    static async updateCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED") {
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
        const { token } = await this.getDecryptedToken();
        await this.fbPost(token, `/${campaign.fbCampaignId}`, { status });
        return prisma.campaign.update({ where: { id: campaignId }, data: { status } });
    }

    static async updateAdSetStatus(adSetId: string, status: "ACTIVE" | "PAUSED") {
        const adSet = await prisma.adSet.findUniqueOrThrow({ where: { id: adSetId } });
        const { token } = await this.getDecryptedToken();
        await this.fbPost(token, `/${adSet.fbAdSetId}`, { status });
        return prisma.adSet.update({ where: { id: adSetId }, data: { status } });
    }

    static async updateAdStatus(adId: string, status: "ACTIVE" | "PAUSED") {
        const ad = await prisma.ad.findUniqueOrThrow({ where: { id: adId } });
        const { token } = await this.getDecryptedToken();
        await this.fbPost(token, `/${ad.fbAdId}`, { status });
        return prisma.ad.update({ where: { id: adId }, data: { status } });
    }

    // ── Budget Management ───────────────────────────────────────────────

    static async updateCampaignBudget(campaignId: string, budget: { dailyBudget?: number; lifetimeBudget?: number }) {
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
        const { token } = await this.getDecryptedToken();

        const params: Record<string, any> = {};
        if (budget.dailyBudget != null) params.daily_budget = toCents(budget.dailyBudget);
        if (budget.lifetimeBudget != null) params.lifetime_budget = toCents(budget.lifetimeBudget);

        await this.fbPost(token, `/${campaign.fbCampaignId}`, params);
        return prisma.campaign.update({ where: { id: campaignId }, data: { dailyBudget: budget.dailyBudget, lifetimeBudget: budget.lifetimeBudget } });
    }

    static async updateAdSetBudget(adSetId: string, budget: { dailyBudget?: number; lifetimeBudget?: number }) {
        const adSet = await prisma.adSet.findUniqueOrThrow({ where: { id: adSetId } });
        const { token } = await this.getDecryptedToken();

        const params: Record<string, any> = {};
        if (budget.dailyBudget != null) params.daily_budget = toCents(budget.dailyBudget);
        if (budget.lifetimeBudget != null) params.lifetime_budget = toCents(budget.lifetimeBudget);

        await this.fbPost(token, `/${adSet.fbAdSetId}`, params);
        return prisma.adSet.update({ where: { id: adSetId }, data: { dailyBudget: budget.dailyBudget, lifetimeBudget: budget.lifetimeBudget } });
    }

    // ── Campaign CRUD ───────────────────────────────────────────────────

    static async createCampaign(adAccountId: string, params: {
        name: string;
        objective: string;
        status?: string;
        specialAdCategories?: string[];
        buyingType?: string;
        dailyBudget?: number;
        lifetimeBudget?: number;
        startTime?: string;
        endTime?: string;
    }) {
        const adAccount = await prisma.adAccount.findUniqueOrThrow({ where: { id: adAccountId } });
        const { token } = await this.getDecryptedToken();

        const fbParams: Record<string, any> = {
            name: params.name,
            objective: params.objective,
            status: params.status || "PAUSED",
            special_ad_categories: params.specialAdCategories || ["NONE"],
            buying_type: params.buyingType || "AUCTION",
        };

        if (params.dailyBudget) fbParams.daily_budget = toCents(params.dailyBudget);
        if (params.lifetimeBudget) fbParams.lifetime_budget = toCents(params.lifetimeBudget);
        if (params.startTime) fbParams.start_time = params.startTime;
        if (params.endTime) fbParams.end_time = params.endTime;

        const result = await this.fbPost(token, `/${adAccount.fbAccountId}/campaigns`, fbParams);

        return prisma.campaign.create({
            data: {
                fbCampaignId: result.id,
                name: params.name,
                status: params.status || "PAUSED",
                objective: params.objective,
                buyingType: params.buyingType || "AUCTION",
                dailyBudget: params.dailyBudget || null,
                lifetimeBudget: params.lifetimeBudget || null,
                specialAdCategories: params.specialAdCategories || ["NONE"],
                startTime: params.startTime ? new Date(params.startTime) : null,
                endTime: params.endTime ? new Date(params.endTime) : null,
                adAccountId,
            },
        });
    }

    static async deleteCampaign(campaignId: string) {
        const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
        const { token } = await this.getDecryptedToken();
        await this.fbDelete(token, `/${campaign.fbCampaignId}`);
        await prisma.campaign.delete({ where: { id: campaignId } });
    }

    // ── Sync ────────────────────────────────────────────────────────────

    static async syncAll() {
        const connections = await prisma.facebookConnection.findMany({
            include: { adAccounts: true },
        });

        for (const conn of connections) {
            try {
                const token = EncryptionService.decrypt(conn.accessToken);

                const daysUntilExpiry = (conn.tokenExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                if (daysUntilExpiry <= 0) {
                    await prisma.facebookConnection.update({
                        where: { id: conn.id },
                        data: { syncStatus: "TOKEN_EXPIRED", lastSyncError: "Token expired" },
                    });
                    continue;
                }
                if (daysUntilExpiry <= 7) {
                    await prisma.facebookConnection.update({
                        where: { id: conn.id },
                        data: { syncStatus: "TOKEN_EXPIRING" },
                    });
                }

                const valid = await this.validateToken(token);
                if (!valid) {
                    await prisma.facebookConnection.update({
                        where: { id: conn.id },
                        data: { syncStatus: "TOKEN_EXPIRED", lastSyncError: "Token validation failed" },
                    });
                    continue;
                }

                for (const account of conn.adAccounts) {
                    await this.syncAdAccount(token, account.id, account.fbAccountId);
                    await new Promise(r => setTimeout(r, 2000));
                }

                await prisma.facebookConnection.update({
                    where: { id: conn.id },
                    data: {
                        lastSyncAt: new Date(),
                        lastSyncError: null,
                        syncStatus: daysUntilExpiry <= 7 ? "TOKEN_EXPIRING" : "OK",
                    },
                });

                log.info(`Sync complete for FB user ${conn.fbUserName}`);
            } catch (e: any) {
                log.error(`Sync failed for connection ${conn.id}:`, e.message);
                await prisma.facebookConnection.update({
                    where: { id: conn.id },
                    data: { syncStatus: "ERROR", lastSyncError: e.message?.substring(0, 500) },
                }).catch(() => {});
            }
        }
    }

    private static async syncAdAccount(token: string, adAccountId: string, fbAccountId: string) {
        log.info(`Syncing ad account ${fbAccountId}...`);

        // Fetch campaigns with budget/schedule fields
        const campaignsRes = await this.fbGet(token, `/${fbAccountId}/campaigns?fields=id,name,status,objective,buying_type,daily_budget,lifetime_budget,special_ad_categories,start_time,stop_time&limit=100`);
        const campaigns = campaignsRes.data || [];

        for (const c of campaigns) {
            const campaign = await prisma.campaign.upsert({
                where: { fbCampaignId: c.id },
                create: {
                    fbCampaignId: c.id, name: c.name, status: c.status,
                    objective: c.objective || null, buyingType: c.buying_type || null,
                    dailyBudget: c.daily_budget ? fromCents(Number(c.daily_budget)) : null,
                    lifetimeBudget: c.lifetime_budget ? fromCents(Number(c.lifetime_budget)) : null,
                    specialAdCategories: c.special_ad_categories || [],
                    startTime: c.start_time ? new Date(c.start_time) : null,
                    endTime: c.stop_time ? new Date(c.stop_time) : null,
                    adAccountId,
                },
                update: {
                    name: c.name, status: c.status,
                    objective: c.objective || null, buyingType: c.buying_type || null,
                    dailyBudget: c.daily_budget ? fromCents(Number(c.daily_budget)) : null,
                    lifetimeBudget: c.lifetime_budget ? fromCents(Number(c.lifetime_budget)) : null,
                    specialAdCategories: c.special_ad_categories || [],
                    startTime: c.start_time ? new Date(c.start_time) : null,
                    endTime: c.stop_time ? new Date(c.stop_time) : null,
                },
            });

            // Fetch adsets with targeting/budget fields
            const adsetsRes = await this.fbGet(token, `/${c.id}/adsets?fields=id,name,status,targeting,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_amount,start_time,end_time&limit=100`);
            for (const as of adsetsRes.data || []) {
                const adSet = await prisma.adSet.upsert({
                    where: { fbAdSetId: as.id },
                    create: {
                        fbAdSetId: as.id, name: as.name, status: as.status,
                        targetingDescription: as.targeting ? JSON.stringify(as.targeting).substring(0, 500) : null,
                        targeting: as.targeting || null,
                        dailyBudget: as.daily_budget ? fromCents(Number(as.daily_budget)) : null,
                        lifetimeBudget: as.lifetime_budget ? fromCents(Number(as.lifetime_budget)) : null,
                        optimizationGoal: as.optimization_goal || null,
                        billingEvent: as.billing_event || null,
                        bidAmount: as.bid_amount ? fromCents(Number(as.bid_amount)) : null,
                        startTime: as.start_time ? new Date(as.start_time) : null,
                        endTime: as.end_time ? new Date(as.end_time) : null,
                        campaignId: campaign.id,
                    },
                    update: {
                        name: as.name, status: as.status,
                        targetingDescription: as.targeting ? JSON.stringify(as.targeting).substring(0, 500) : null,
                        targeting: as.targeting || null,
                        dailyBudget: as.daily_budget ? fromCents(Number(as.daily_budget)) : null,
                        lifetimeBudget: as.lifetime_budget ? fromCents(Number(as.lifetime_budget)) : null,
                        optimizationGoal: as.optimization_goal || null,
                        billingEvent: as.billing_event || null,
                        bidAmount: as.bid_amount ? fromCents(Number(as.bid_amount)) : null,
                        startTime: as.start_time ? new Date(as.start_time) : null,
                        endTime: as.end_time ? new Date(as.end_time) : null,
                    },
                });

                // Fetch ads
                const adsRes = await this.fbGet(token, `/${as.id}/ads?fields=id,name,status,creative{id}&limit=100`);
                for (const ad of adsRes.data || []) {
                    await prisma.ad.upsert({
                        where: { fbAdId: ad.id },
                        create: {
                            fbAdId: ad.id, name: ad.name, status: ad.status,
                            creativeId: ad.creative?.id || null, adSetId: adSet.id,
                        },
                        update: { name: ad.name, status: ad.status, creativeId: ad.creative?.id || null },
                    });
                }
            }

            // Fetch campaign-level insights
            const daysBack = config.facebook.insightsDaysBack;
            const since = new Date();
            since.setDate(since.getDate() - daysBack);
            const sinceStr = since.toISOString().split("T")[0];
            const untilStr = new Date().toISOString().split("T")[0];
            const timeRange = encodeURIComponent(JSON.stringify({ since: sinceStr, until: untilStr }));

            try {
                const insightsRes = await this.fbGet(
                    token,
                    `/${c.id}/insights?fields=spend,impressions,clicks,reach,actions,cost_per_action_type`
                    + `&time_range=${timeRange}&time_increment=1&limit=100`
                );

                for (const insight of insightsRes.data || []) {
                    const date = new Date(insight.date_start);
                    const conversions = this.extractAction(insight.actions, [
                        "onsite_conversion.messaging_conversation_started_7d",
                        "onsite_conversion.messaging_first_reply",
                        "messaging_conversation_started_7d",
                    ]);
                    const costPerConversion = this.extractAction(insight.cost_per_action_type, [
                        "onsite_conversion.messaging_conversation_started_7d",
                        "onsite_conversion.messaging_first_reply",
                        "messaging_conversation_started_7d",
                    ]);

                    await prisma.adInsight.upsert({
                        where: {
                            date_level_campaignId_adSetId_adId: {
                                date, level: "CAMPAIGN", campaignId: campaign.id, adSetId: null as any, adId: null as any,
                            },
                        },
                        create: {
                            date, level: "CAMPAIGN", campaignId: campaign.id,
                            spend: parseFloat(insight.spend || "0"),
                            impressions: parseInt(insight.impressions || "0"),
                            clicks: parseInt(insight.clicks || "0"),
                            reach: parseInt(insight.reach || "0"),
                            conversions: parseInt(conversions || "0"),
                            costPerConversion: parseFloat(costPerConversion || "0"),
                            rawActions: insight.actions || null,
                        },
                        update: {
                            spend: parseFloat(insight.spend || "0"),
                            impressions: parseInt(insight.impressions || "0"),
                            clicks: parseInt(insight.clicks || "0"),
                            reach: parseInt(insight.reach || "0"),
                            conversions: parseInt(conversions || "0"),
                            costPerConversion: parseFloat(costPerConversion || "0"),
                            rawActions: insight.actions || null,
                        },
                    });
                }
            } catch (e: any) {
                log.warn(`Failed to fetch insights for campaign ${c.id}: ${e.message}`);
            }
        }

        await prisma.adAccount.update({
            where: { id: adAccountId },
            data: { lastSyncAt: new Date() },
        });
    }

    static async validateToken(token: string): Promise<boolean> {
        try {
            const res = await fetch(`${GRAPH_URL}/me?access_token=${token}`);
            const data = await res.json() as { id?: string; error?: any };
            return !!data.id;
        } catch {
            return false;
        }
    }

    private static extractAction(actions: any[] | undefined, actionTypes: string[]): string {
        if (!actions || !Array.isArray(actions)) return "0";
        for (const type of actionTypes) {
            const found = actions.find((a: any) => a.action_type === type);
            if (found) return found.value;
        }
        return "0";
    }
}
