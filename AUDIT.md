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

### [ ] 5. Queries innecesarias en loops
- `BotConfigService.loadBot()` se llama 10+ veces por mensaje en tool loop
- `resolveTools()` se re-fetcha cada iteración
- Fix: pasar bot como parámetro, cachear tools

### [x] 6. Cache de recentLabelEvents sin límite de tamaño
Agregado max size (10K) + evicción periódica cada 60s

## P2 — Medio

### [x] 7. Centralizar constantes en `config.ts`
Creado config.ts con env var overrides para todos los valores mágicos

### [x] 8. Unificar `message-sender.ts` + `main-process-client.ts`
message-sender.ts ahora re-exporta desde main-process-client.ts

### [ ] 9. Eliminar duplicación de código
- Detección de URLs (5 archivos)
- Patrón loadBot → if !bot return (5 lugares)
- Merge de metadata manual (3 lugares)

### [ ] 10. Retry logic en main-process-client
Agregar exponential backoff para /internal/* endpoints

## P3 — Bajo

### [ ] 11. Agregar tests
Al menos ToolExecutor, AIEngine, FlowEngine

### [ ] 12. Logger centralizado
Reemplazar console.log/warn/error con logger con niveles y prefijos consistentes

### [x] 13. Limpiar connectionTimestamps
Se limpia en disconnect y stopSession
