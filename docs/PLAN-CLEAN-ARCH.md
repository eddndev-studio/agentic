# Plan: Clean Architecture — Multi-Provider Messaging

**Fecha:** 2026-04-03  
**Objetivo:** Desacoplar Baileys del core para soportar Baileys + WhatsApp Business API (y eventualmente Telegram) bajo las mismas features.

---

## Diagnóstico actual

### Fortalezas
- Workers separados del main process (AI/Step processing aislado)
- HTTP bridge (mainProcessClient) — worker ya no toca Baileys directo
- BullMQ desacoplado — processors son provider-agnostic
- EventBus genérico
- Platform enum existe en Prisma schema

### Pecados arquitectónicos
1. **BaileysService es God Object (41KB)** — conexión, QR, reconexión, watchdog, envío, lectura, presencia, labels, credenciales, todo junto
2. **Zero DI** — todo singleton a nivel de módulo, no intercambiable
3. **Baileys hardcodeado en 13+ archivos** — index.ts, message-ingest, bot.controller, StepProcessor, label.service, etc.
4. **Platform enum no se usa** — existe pero no se verifica en startup ni en step execution
5. **MessageIngestService mezcla normalización con negocio** — JID normalization + unwrap view-once + persistencia + filtros + triggers en ~250 líneas
6. **StepProcessor hardcodea payloads Baileys** — `{ image: { url }, caption }` es formato Baileys, no genérico
7. **Prisma directo en todos lados** — sin repositories, queries esparcidas en 15+ servicios

---

## Arquitectura objetivo

```
                    ┌─────────────┐
                    │  Controller │  (API routes)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Service   │  (business logic, platform-agnostic)
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
     ┌────────▼───┐  ┌─────▼─────┐  ┌──▼──────────┐
     │  Baileys   │  │  WA Biz   │  │  Telegram   │
     │  Provider  │  │  API Prov │  │  Provider   │
     └────────────┘  └───────────┘  └─────────────┘
```

---

## Fases de implementación

### Fase 1: Interface + Extracción (completada 2026-04-03)
- [x] Crear `IMessagingProvider` interface en `backend/src/providers/types.ts`
- [x] Crear adapter `backend/src/providers/baileys.adapter.ts` que wrappea BaileysService
- [x] Crear `ProviderRegistry` con cache bot→platform en `backend/src/providers/registry.ts`
- [x] Migrar `index.ts` (shutdown + internal endpoints)
- [x] Migrar `bot.controller.ts` (connect/qr/status/disconnect)
- [x] Migrar `public.controller.ts` (connect flow público)
- [x] Migrar `session.controller.ts` (labels, send, markRead, react)
- [x] Migrar `ToolExecutor.ts` (send, markRead, presence, labels)
- [x] Migrar `AIEngine.ts` (markRead, presence)
- [x] Migrar `notification.service.ts` (sendMessage)
- [x] Zero `BaileysService` imports fuera de `baileys.adapter.ts` y `baileys.service.ts`

### Fase 2: Normalizar mensajes (completada 2026-04-03)
- [x] Crear `NormalizedMessage` + `MessageType` en `providers/types.ts`
- [x] Crear `providers/baileys.normalizer.ts` — transforma WAMessage → NormalizedMessage (JID, unwrap, type, content, media buffer)
- [x] Refactorizar `MessageIngestService.handleIncomingMessage` para recibir `NormalizedMessage` — zero imports de Baileys
- [x] Refactorizar `MediaService.attachMediaBuffer` para recibir buffer en vez de WAMessage — zero imports de Baileys
- [x] Actualizar `baileys.service.ts` messages.upsert → normalizer → ingest
- [x] Refactorizar `persistOutgoingMessage` — provider normaliza JID y extrae metadata antes de llamar
- [x] Limpiar `session-helpers.ts` — eliminar `jidNormalizedUser`, callers pasan identifiers pre-normalizados
- [x] Imports de `@whiskeysockets/baileys` eliminados de: `message-ingest.service.ts`, `media.service.ts`, `session-helpers.ts`
- [x] Imports restantes solo en: `baileys.service.ts`, `baileys.normalizer.ts` (provider), `label.service.ts` (fase 5)

### Fase 3: Generalizar payloads de salida (completada 2026-04-03)
- [x] Crear `OutgoingPayload` (discriminated union) en `providers/types.ts` — TEXT, IMAGE, VIDEO, AUDIO, DOCUMENT, REACTION, REPLY
- [x] Agregar `toNativePayload()` en `baileys.adapter.ts` — traduce OutgoingPayload → formato nativo Baileys
- [x] Cambiar `IMessagingProvider.sendMessage` para aceptar `OutgoingPayload` en vez de `Record<string, unknown>`
- [x] Migrar `StepProcessor.ts` — payloads genéricos, extraer helper `buildStepPayload()`
- [x] Migrar `ToolExecutor.ts` — flow steps, reply_to_message, send_followup, notify
- [x] Migrar `session.controller.ts` — send endpoint y react endpoint
- [x] Migrar `main-process-client.ts` y `/internal/send` — tipado OutgoingPayload end-to-end
- [x] Migrar `notification.service.ts` — payload TEXT normalizado
- [x] Eliminar guard `Platform.WHATSAPP` del StepProcessor (payloads ahora son platform-agnostic)

### Fase 4: Implementar WhatsAppBusinessAPIProvider (3-5 días)
- [ ] Implementar `IMessagingProvider` para la API oficial
- [ ] Auth via OAuth2 / token (no QR)
- [ ] Webhook receiver para mensajes entrantes
- [ ] Mapeo de eventos webhook → `NormalizedMessage`

### Fase 5: Features platform-specific (1 día)
- [ ] Labels → módulo separado con `WhatsAppLabelService`, extensible
- [ ] QR → solo BaileysProvider
- [ ] Credenciales → strategy per platform

### Fase 6: Testing dual provider (2-3 días)
- [ ] Tests unitarios por provider
- [ ] Test E2E con ambos providers activos
- [ ] Validar que features existentes no se rompan

---

## Interface principal

```typescript
interface IMessagingProvider {
  readonly platform: Platform

  // Lifecycle
  startSession(botId: string): Promise<void>
  stopSession(botId: string): Promise<void>
  getStatus(botId: string): ConnectionStatus
  shutdownAll(): Promise<void>

  // Messaging
  sendMessage(botId: string, to: string, content: Record<string, unknown>): Promise<{ id?: string }>
  markRead(botId: string, chatId: string, messageIds: string[]): Promise<void>
  sendPresence(botId: string, chatId: string, type: 'composing' | 'paused'): Promise<void>

  // Auth (provider-specific)
  getQR?(botId: string): string | null
  requestPairingCode?(botId: string, phone: string): Promise<string>

  // Events — cada provider emite eventos normalizados al eventBus
}
```

---

## Archivos clave a refactorear

| Archivo | Cambio |
|---------|--------|
| `services/baileys.service.ts` | → `providers/baileys/baileys.provider.ts` |
| `index.ts` | Usar ProviderRegistry en vez de BaileysService directo |
| `api/bot.controller.ts` | `/connect`, `/qr`, `/status`, `/disconnect` → via registry |
| `api/public.controller.ts` | QR público → via registry |
| `workers/processors/StepProcessor.ts` | Fase 3: payloads genéricos |
| `services/message-ingest.service.ts` | Fase 2: recibir NormalizedMessage |
| `services/label.service.ts` | Fase 5: módulo platform-specific |

---

## Notas
- El HTTP bridge (mainProcessClient) ya es una abstracción natural — el worker no necesita saber qué provider usa el main process
- AIProcessor no importa Baileys — ya está desacoplado
- La migración es incremental, no hay big bang
