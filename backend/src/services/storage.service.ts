import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g. https://media.yourdomain.com

let s3Client: S3Client | null = null;

function getClient(): S3Client {
    if (!s3Client) {
        s3Client = new S3Client({
            region: 'auto',
            endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: R2_ACCESS_KEY_ID!,
                secretAccessKey: R2_SECRET_ACCESS_KEY!,
            },
        });
    }
    return s3Client;
}

export class StorageService {

    /**
     * Whether R2 is configured. When false, callers should fall back to local storage.
     */
    static isConfigured(): boolean {
        return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && R2_PUBLIC_URL);
    }

    /**
     * Upload a file to R2.
     * @param key   Object key (e.g. "uploads/123456.jpg" or "media/botId/123456.ogg")
     * @param body  File contents
     * @param contentType  MIME type
     * @returns Public URL of the uploaded file
     */
    static async upload(key: string, body: Buffer, contentType: string): Promise<string> {
        const client = getClient();
        await client.send(new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
            Body: body,
            ContentType: contentType,
        }));
        return `${R2_PUBLIC_URL}/${key}`;
    }

    /**
     * List objects under a prefix (e.g. "uploads/").
     */
    static async list(prefix: string): Promise<{ key: string; url: string; size: number; lastModified: Date }[]> {
        const client = getClient();
        const response = await client.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: prefix,
        }));
        return (response.Contents || []).map(obj => ({
            key: obj.Key!,
            url: `${R2_PUBLIC_URL}/${obj.Key}`,
            size: obj.Size || 0,
            lastModified: obj.LastModified || new Date(),
        }));
    }

    /**
     * Delete a file from R2.
     */
    static async delete(key: string): Promise<void> {
        const client = getClient();
        await client.send(new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key,
        }));
    }

    /**
     * Build a public URL for a given key.
     */
    static getPublicUrl(key: string): string {
        return `${R2_PUBLIC_URL}/${key}`;
    }
}
