/**
 * Centralized Prisma error handling utility.
 *
 * Prisma throws PrismaClientKnownRequestError with specific codes:
 *   P2002 — Unique constraint violation
 *   P2003 — Foreign key constraint failed
 *   P2025 — Record not found (update/delete on non-existent row)
 *
 * Usage:
 *   catch (e: unknown) {
 *     const [status, body] = handlePrismaError(e, "Bot");
 *     set.status = status;
 *     return body;
 *   }
 */
export function handlePrismaError(
    error: unknown,
    entity: string,
): [number, { error: string }] {
    if (isPrismaError(error)) {
        switch (error.code) {
            case "P2025":
                return [404, { error: `${entity} not found` }];
            case "P2002": {
                const target = (error.meta?.target as string[])?.join(", ") || "field";
                return [409, { error: `${entity} with this ${target} already exists` }];
            }
            case "P2003":
                return [409, { error: `Cannot complete operation: related ${entity} data still exists` }];
        }
    }

    console.error(`[${entity}] Unexpected error:`, error);
    return [500, { error: "Internal server error" }];
}

function isPrismaError(e: unknown): e is { code: string; meta?: Record<string, unknown> } {
    return (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        typeof (e as Record<string, unknown>).code === "string" &&
        (e as Record<string, unknown>).code.toString().startsWith("P")
    );
}
