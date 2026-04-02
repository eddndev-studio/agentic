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

export class FacebookService {
    /**
     * Exchange short-lived token for long-lived, store encrypted, fetch ad accounts.
     */
    static async connect(shortLivedToken: string, fbUserId: string, fbUserName: string) {
        // 1. Exchange for long-lived token
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
        const expiresIn = data.expires_in || 5184000; // Default 60 days
        const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

        // 2. Encrypt and store
        const encrypted = EncryptionService.encrypt(longLivedToken);

        const connection = await prisma.facebookConnection.upsert({
            where: { fbUserId },
            create: {
                accessToken: encrypted,
                tokenExpiry,
                fbUserId,
                fbUserName,
                syncStatus: "OK",
            },
            update: {
                accessToken: encrypted,
                tokenExpiry,
                fbUserName,
                syncStatus: "OK",
                lastSyncError: null,
            },
        });

        // 3. Fetch ad accounts
        const adAccountsRes = await this.fbGet(longLivedToken, "/me/adaccounts?fields=id,name,account_status&limit=50");
        const adAccounts = (adAccountsRes.data || []).filter((a: any) => a.account_status === 1);

        // Upsert ad accounts
        for (const acc of adAccounts) {
            await prisma.adAccount.upsert({
                where: { fbAccountId: acc.id },
                create: {
                    fbAccountId: acc.id,
                    name: acc.name,
                    accountStatus: acc.account_status,
                    connectionId: connection.id,
                },
                update: {
                    name: acc.name,
                    accountStatus: acc.account_status,
                    connectionId: connection.id,
                },
            });
        }

        return {
            connected: true,
            fbUserName,
            tokenExpiry,
            adAccountCount: adAccounts.length,
        };
    }

    /**
     * Sync all ad accounts: campaigns, adsets, ads, insights.
     */
    static async syncAll() {
        const connections = await prisma.facebookConnection.findMany({
            include: { adAccounts: true },
        });

        for (const conn of connections) {
            try {
                const token = EncryptionService.decrypt(conn.accessToken);

                // Check token health
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

                // Validate token
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
                    // Rate limit: 2s between accounts
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

        // Fetch campaigns
        const campaignsRes = await this.fbGet(token, `/${fbAccountId}/campaigns?fields=id,name,status,objective&limit=100`);
        const campaigns = campaignsRes.data || [];

        for (const c of campaigns) {
            const campaign = await prisma.campaign.upsert({
                where: { fbCampaignId: c.id },
                create: { fbCampaignId: c.id, name: c.name, status: c.status, objective: c.objective || null, adAccountId },
                update: { name: c.name, status: c.status, objective: c.objective || null },
            });

            // Fetch adsets
            const adsetsRes = await this.fbGet(token, `/${c.id}/adsets?fields=id,name,status,targeting&limit=100`);
            for (const as of adsetsRes.data || []) {
                const adSet = await prisma.adSet.upsert({
                    where: { fbAdSetId: as.id },
                    create: {
                        fbAdSetId: as.id, name: as.name, status: as.status,
                        targetingDescription: as.targeting ? JSON.stringify(as.targeting).substring(0, 500) : null,
                        campaignId: campaign.id,
                    },
                    update: { name: as.name, status: as.status },
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

            // Fetch campaign-level insights for recent days
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

    private static async fbGet(token: string, path: string): Promise<any> {
        const separator = path.includes("?") ? "&" : "?";
        const url = `${GRAPH_URL}${path}${separator}access_token=${token}`;
        const res = await fetch(url);
        const data = await res.json() as any;
        if (data.error) {
            throw new Error(`Facebook API error: ${data.error.message || JSON.stringify(data.error)}`);
        }
        return data;
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
