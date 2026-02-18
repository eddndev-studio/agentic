import { Elysia, t } from "elysia";
import { join } from "path";
import { mkdir, readdir, stat, writeFile, readFile } from "fs/promises";
import { createReadStream, existsSync } from "fs";
import { lookup } from "mime-types";

const UPLOAD_DIR = "./uploads";

// Ensure upload dir exists
await mkdir(UPLOAD_DIR, { recursive: true });

export const uploadController = new Elysia({ prefix: "/upload" })
    .post("/", async ({ body, set }) => {
        console.log("[Upload] Incoming upload request...");

        try {
            const file = body.file;

            if (!file) {
                console.log("[Upload] No file in request body");
                set.status = 400;
                return { status: "error", message: "No file uploaded" };
            }

            console.log(`[Upload] Received file: ${file.name}, size: ${file.size}, type: ${file.type}`);

            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
            const extension = file.name.split('.').pop() || "bin";
            const filename = `${uniqueSuffix}.${extension}`;
            const filePath = join(UPLOAD_DIR, filename);

            console.log(`[Upload] Writing to: ${filePath}`);

            // Write file using Node fs
            const buffer = Buffer.from(await file.arrayBuffer());
            await writeFile(filePath, buffer);

            console.log(`[Upload] File saved: ${filename} (${file.size} bytes)`);

            const url = `/upload/files/${filename}`;

            return {
                status: "success",
                filename,
                url
            };
        } catch (error: any) {
            console.error("[Upload] ERROR:", error);
            console.error("[Upload] Stack:", error.stack);
            set.status = 500;
            return { status: "error", message: error.message || "Upload failed" };
        }
    }, {
        body: t.Object({
            file: t.File()
        })
    })
    .get("/list", async () => {
        try {
            const files = await readdir(UPLOAD_DIR);

            const fileList = await Promise.all(files.map(async (f) => {
                const stats = await stat(join(UPLOAD_DIR, f));
                return {
                    name: f,
                    url: `/upload/files/${f}`,
                    size: stats.size,
                    createdAt: stats.birthtime
                };
            }));

            // Sort by newest first
            return {
                files: fileList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            };
        } catch (e: any) {
            console.error("List files error", e);
            return { files: [] };
        }
    })
    .get("/files/:name", async ({ params: { name }, set }) => {
        const filePath = join(UPLOAD_DIR, name);

        if (!existsSync(filePath)) {
            set.status = 404;
            return "File not found";
        }

        const buffer = await readFile(filePath);
        const mimeType = lookup(name) || "application/octet-stream";

        return new Response(buffer, {
            headers: { "Content-Type": mimeType }
        });
    });
