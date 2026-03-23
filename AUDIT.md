# Auditoría Arquitectónica - Agentic
> Fecha: 2026-03-22 | Estado: En progreso

## P0 — Crítico

### [ ] 1. God Object: `baileys.service.ts` (1,571 líneas)
Partir en:
- `ConnectionService` — socket lifecycle, watchdog, reconnect, QR
- `MessageIngestService` — handleIncomingMessage, dedup, message persistence
- `MediaService` — downloadAndAttachMedia, generateMediaDescription, storage
- `LabelService` — syncLabels, reconcileLabels, addChatLabel, removeChatLabel, dedup
- `BaileysService` — orquestador delgado que conecta todo + sendMessage

### [ ] 2. Zod schemas para campos JSON de Prisma
Campos sin validación: `metadata` (Message, Step), `actionConfig` (Tool), `notificationChannels` (Bot), `credentials` (Bot), `botVariables` (Bot)

### [ ] 3. Eliminar abuso de `any` (184+ instancias)
Peores: baileys.service (52), ToolExecutor (15), bot.controller (14), flow.controller (10)

## P1 — Alto

### [ ] 4. Error handling silencioso
Reemplazar 30+ `.catch(() => {})` y `catch {}` con logging real

### [ ] 5. Queries innecesarias en loops
- `BotConfigService.loadBot()` se llama 10+ veces por mensaje en tool loop
- `resolveTools()` se re-fetcha cada iteración
- Fix: pasar bot como parámetro, cachear tools

### [ ] 6. Cache de recentLabelEvents sin límite de tamaño
Agregar max size + evicción periódica

## P2 — Medio

### [ ] 7. Centralizar constantes en `config.ts`
CORS origins, timeouts, TTLs, grace periods → env vars con fallback

### [ ] 8. Unificar `message-sender.ts` + `main-process-client.ts`
Código duplicado para comunicación worker→main

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

### [ ] 13. Limpiar connectionTimestamps
Nunca se limpia en disconnect
