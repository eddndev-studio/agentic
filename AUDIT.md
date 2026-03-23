# Auditoría Arquitectónica - Agentic
> Fecha: 2026-03-22 | Estado: COMPLETADA

## P0 — Crítico

### [x] 1. God Object: `baileys.service.ts` (1,571 → 847 líneas)
Partido en 5 servicios: session-helpers, media.service, label.service, message-ingest.service, baileys.service

### [x] 2. Zod schemas para campos JSON de Prisma
Creado schemas.ts con validación tipada para todos los campos JSON. Safe parsers con defaults.

### [x] 3. Eliminar abuso de `any` (222 → 61 instancias, 71% reducción)
- `catch (e: any)` → `catch (e: unknown)` con instanceof guards (50+)
- Event bus tipado con Prisma types (Message, Session, etc.)
- AI providers, ToolExecutor, FlowEngine todos tipados
- 61 restantes son: Elysia bodies sin tipo (15), Baileys internals (13), JSON dinámico de AI (7), otros justificados

## P1 — Alto

### [x] 4. Error handling silencioso
30+ `.catch(() => {})` y `catch {}` reemplazados con logging real o marcados como fire-and-forget

### [x] 5. Queries innecesarias en loops
Bot pre-cargado y pasado por parámetro en tool loop. 7+ queries eliminadas por mensaje.

### [x] 6. Cache de recentLabelEvents sin límite de tamaño
Agregado max size (10K) + evicción periódica cada 60s

## P2 — Medio

### [x] 7. Centralizar constantes en `config.ts`
Creado config.ts con env var overrides para todos los valores mágicos

### [x] 8. Unificar `message-sender.ts` + `main-process-client.ts`
message-sender.ts ahora re-exporta desde main-process-client.ts

### [x] 9. Eliminar duplicación de código
Creado utils/helpers.ts con isRemoteUrl() y updateMessageMetadata(). 9 patrones reemplazados en 7 archivos.

### [x] 10. Retry logic en main-process-client
Exponential backoff (3 retries, 200/400/800ms) para /internal/* endpoints

## P3 — Bajo

### [x] 11. Agregar tests
vitest configurado. 4 suites, 80 tests: schemas, config, utils, chat-context

### [x] 12. Logger centralizado
Creado logger.ts con createLogger(). 5 servicios core migrados (~110 console calls). LOG_LEVEL configurable.

### [x] 13. Limpiar connectionTimestamps
Se limpia en disconnect y stopSession
