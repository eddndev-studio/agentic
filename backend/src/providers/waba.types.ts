/**
 * WhatsApp Cloud API (WABA) — webhook payload and API response types.
 * Based on Meta Graph API v21.0.
 */

// ── Incoming webhook payload ────────────────────────────────────────────────

export interface WABAWebhookPayload {
    object: 'whatsapp_business_account';
    entry: WABAEntry[];
}

export interface WABAEntry {
    id: string;
    changes: WABAChange[];
}

export interface WABAChange {
    value: WABAChangeValue;
    field: string;
}

export interface WABAChangeValue {
    messaging_product: 'whatsapp';
    metadata: {
        display_phone_number: string;
        phone_number_id: string;
    };
    contacts?: WABAContact[];
    messages?: WABAMessage[];
    statuses?: WABAStatus[];
}

export interface WABAContact {
    profile: { name: string };
    wa_id: string;
}

export interface WABAMessage {
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    image?: WABAMediaInfo;
    video?: WABAMediaInfo;
    audio?: WABAMediaInfo;
    document?: WABAMediaInfo & { filename?: string };
    sticker?: WABAMediaInfo;
    reaction?: { message_id: string; emoji: string };
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    contacts?: Array<{ name: { formatted_name: string }; phones?: Array<{ phone: string }> }>;
    context?: { from?: string; id?: string };
}

export interface WABAMediaInfo {
    id: string;
    mime_type: string;
    sha256?: string;
    caption?: string;
}

export interface WABAStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
    errors?: Array<{ code: number; title: string }>;
}

// ── Outgoing API payloads ───────────────────────────────────────────────────

export interface WABASendPayload {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: string;
    text?: { body: string; preview_url?: boolean };
    image?: { link: string; caption?: string };
    video?: { link: string; caption?: string };
    audio?: { link: string };
    document?: { link: string; caption?: string; filename?: string };
    reaction?: { message_id: string; emoji: string };
    context?: { message_id: string };
}

export interface WABASendResponse {
    messaging_product: 'whatsapp';
    contacts: Array<{ input: string; wa_id: string }>;
    messages: Array<{ id: string }>;
}

export interface WABAMediaUrlResponse {
    url: string;
    mime_type: string;
    sha256: string;
    file_size: number;
    id: string;
}
