# Auditoría Arquitectónica - Agentic
> Fecha: 2026-03-22 | Estado: En progreso

## P0 — Crítico

### [x] 1. God Object: `baileys.service.ts` (1,571 → 847 líneas)
Partido en 5 servicios: session-helpers, media.service, label.service, message-ingest.service, baileys.service

### [ ] 2. Zod schemas para campos JSON de Prisma
Campos sin validación: `metadata` (Message, Step), `actionConfig` (Tool), `notificationChannels` (Bot), `credentials` (Bot), `botVariables` (Bot)

### [ ] 3. Eliminar abuso de `any` (184+ instancias)
Peores: baileys.service (52), ToolExecutor (15), bot.controller (14), flow.controller (10)

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

### [ ] 11. Agregar tests
Al menos ToolExecutor, AIEngine, FlowEngine

### [ ] 12. Logger centralizado
Reemplazar console.log/warn/error con logger con niveles y prefijos consistentes

### [x] 13. Limpiar connectionTimestamps
Se limpia en disconnect y stopSession
