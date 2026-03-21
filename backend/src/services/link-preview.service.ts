/**
 * Link Preview Service
 * Detects URLs in text and fetches Open Graph metadata
 * to generate explicit link previews for WhatsApp messages.
 */

const URL_REGEX = /https?:\/\/[^\s<>\"')\]]+/gi;

const OG_TIMEOUT_MS = 5_000;

interface LinkPreview {
    'canonical-url': string;
    'matched-text': string;
    title: string;
    description: string;
    jpegThumbnail?: Buffer;
}

/**
 * Extract the first URL found in text.
 */
export function extractUrl(text: string): string | null {
    const match = text.match(URL_REGEX);
    return match ? match[0] : null;
}

/**
 * Fetch Open Graph metadata from a URL.
 * Returns null if fetch fails or no OG data is found.
 */
async function fetchOgMeta(url: string): Promise<{ title: string; description: string; image?: string } | null> {
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'WhatsApp/2',
                'Accept': 'text/html',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(OG_TIMEOUT_MS),
        });

        if (!res.ok) return null;

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('text/html')) return null;

        const html = await res.text();

        const title = extractMeta(html, 'og:title') || extractTagContent(html, 'title');
        const description = extractMeta(html, 'og:description') || extractMeta(html, 'description') || '';
        const image = extractMeta(html, 'og:image') || undefined;

        if (!title) return null;

        return { title, description, image };
    } catch {
        return null;
    }
}

/**
 * Extract content from <meta property="X"> or <meta name="X"> tags.
 */
function extractMeta(html: string, property: string): string | null {
    // Match both property="og:X" and name="X"
    const regex = new RegExp(
        `<meta[^>]*(?:property|name)=["']${escapeRegex(property)}["'][^>]*content=["']([^"']*)["']` +
        `|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeRegex(property)}["']`,
        'i'
    );
    const match = html.match(regex);
    if (!match) return null;
    return decodeHtmlEntities(match[1] || match[2] || '');
}

/**
 * Extract content from <title> tag.
 */
function extractTagContent(html: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
    const match = html.match(regex);
    return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtmlEntities(str: string): string {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, '/');
}

/**
 * Fetch a thumbnail image as JPEG buffer.
 */
async function fetchThumbnail(imageUrl: string): Promise<Buffer | undefined> {
    try {
        const res = await fetch(imageUrl, {
            signal: AbortSignal.timeout(OG_TIMEOUT_MS),
        });
        if (!res.ok) return undefined;
        return Buffer.from(await res.arrayBuffer());
    } catch {
        return undefined;
    }
}

/**
 * Generate a Baileys-compatible link preview object for a text message.
 * Returns null if no URL is found or OG fetch fails.
 */
export async function generateLinkPreview(text: string): Promise<LinkPreview | null> {
    const url = extractUrl(text);
    if (!url) return null;

    const og = await fetchOgMeta(url);
    if (!og) return null;

    let jpegThumbnail: Buffer | undefined;
    if (og.image) {
        // Resolve relative image URLs
        const imageUrl = og.image.startsWith('http') ? og.image : new URL(og.image, url).href;
        jpegThumbnail = await fetchThumbnail(imageUrl);
    }

    return {
        'canonical-url': url,
        'matched-text': url,
        title: og.title,
        description: og.description,
        ...(jpegThumbnail ? { jpegThumbnail } : {}),
    };
}
