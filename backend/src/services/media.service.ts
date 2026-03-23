import { downloadMediaMessage, type WAMessage } from '@whiskeysockets/baileys';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from './postgres.service';
import { StorageService } from './storage.service';

export class MediaService {
    /**
     * Download media from a WhatsApp message, store in R2 (or local fallback),
     * and attach the URL to the persisted message.
     */
    static async downloadAndAttachMedia(msg: WAMessage & { message: any }, msgType: string, messageId: string, botId?: string): Promise<void> {
        const buffer = await downloadMediaMessage(msg, 'buffer', {});
        if (!buffer) return;

        const MIME_MAP: Record<string, { ext: string; mime: string }> = {
            IMAGE:    { ext: 'jpg',  mime: 'image/jpeg' },
            AUDIO:    { ext: 'ogg',  mime: 'audio/ogg' },
            PTT:      { ext: 'ogg',  mime: 'audio/ogg' },
            VIDEO:    { ext: 'mp4',  mime: 'video/mp4' },
            STICKER:  { ext: 'webp', mime: 'image/webp' },
            DOCUMENT: { ext: msg.message.documentMessage?.fileName?.split('.').pop() || 'pdf',
                        mime: msg.message.documentMessage?.mimetype || 'application/octet-stream' },
        };
        const { ext, mime } = MIME_MAP[msgType] || { ext: 'bin', mime: 'application/octet-stream' };
        const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        let mediaUrl: string;

        if (StorageService.isConfigured()) {
            // Upload to R2
            const key = `media/${botId || 'unknown'}/${filename}`;
            mediaUrl = await StorageService.upload(key, buffer as Buffer, mime);
            console.log(`[Media] Media uploaded to R2: ${key}`);
        } else {
            // Fallback: save locally
            const uploadDir = path.resolve('uploads');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filePath = path.join(uploadDir, filename);
            fs.writeFileSync(filePath, buffer as Buffer);
            mediaUrl = filePath;
            console.log(`[Media] Media saved locally: ${filePath}`);
        }

        // Merge mediaUrl with any existing metadata (e.g. sticker animated flag)
        const existing = await prisma.message.findUnique({ where: { id: messageId }, select: { metadata: true } });
        await prisma.message.update({
            where: { id: messageId },
            data: { metadata: { ...(existing?.metadata as any || {}), mediaUrl } },
        });
    }

    /**
     * Fire-and-forget: generate a brief media description for chat context.
     * Uses a cheap vision/transcription call and caches in message metadata.
     */
    static async generateMediaDescription(messageId: string, msgType: string, mediaUrl: string | undefined, aiProvider: string): Promise<void> {
        if (!mediaUrl) return;

        try {
            let description: string | null = null;

            if (msgType === 'IMAGE') {
                const { VisionService } = await import('./media/vision.service');
                description = await VisionService.analyze(mediaUrl, "Describe this image briefly in 1 sentence in Spanish.", aiProvider);
            } else if (msgType === 'DOCUMENT' && mediaUrl.toLowerCase().endsWith('.pdf')) {
                const { PDFService } = await import('./media/pdf.service');
                const text = await PDFService.extractText(mediaUrl);
                description = text.substring(0, 200);
            }
            // Audio transcriptions are cached by AIProcessor after full processing

            if (description) {
                const msg = await prisma.message.findUnique({ where: { id: messageId } });
                if (msg) {
                    await prisma.message.update({
                        where: { id: messageId },
                        data: { metadata: { ...(msg.metadata as any || {}), mediaDescription: description } },
                    });
                }
            }
        } catch (e) {
            console.warn(`[Media] Media description failed for ${messageId}:`, (e as Error).message);
        }
    }
}
