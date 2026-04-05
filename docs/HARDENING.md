# Hardening Report — Agentic

Fecha: 2026-04-04

---

## 1. BACKEND — Patrones Débiles

### CRÍTICO

- [x] **JWT secret hardcodeado como fallback** — `auth.middleware.ts:9`, `events.controller.ts:8`
  - ~~Usa `process.env.JWT_SECRET || "DEV_SECRET_DO_NOT_USE_IN_PROOD"`~~
  - **Resuelto:** `252736c` — `envRequired('JWT_SECRET')` en config.ts, fail en startup.

### ALTO

- [x] **`as any` en 31 instancias** — elimina type safety en bodies de request
  - **Resuelto:** `022b944` — Todos los body casts reemplazados con Typebox schemas.

- [x] **Sin rate limiting en endpoints de auth** — `/auth/login`, `/auth/register`, `/auth/forgot-password`
  - **Resuelto:** `5c75a9e` — Rate limiter Redis (sliding window) en register/login/forgot-password.

- [x] **Catch-all genéricos que tragan errores reales** — 83+ instancias
  - **Resuelto:** `ae168f6` — `handlePrismaError()` utility + todos `catch (e: any)` → `catch (e: unknown)`.

- [ ] **Sin service layer** — Controllers mezclan HTTP + validación + lógica + queries Prisma
  - `bot.controller.ts` (clone: 295-403), `flow.controller.ts` (import/export: 293-389), `session.controller.ts` (chat context: 238-281)
  - **Fix:** Extraer a `FlowService`, `BotService`, `SessionService`, etc.

### MEDIO

- [x] **Sin validación de bounds en limit/offset** — `execution.controller.ts:54-55`
  - **Resuelto:** `68f8351` — Clamp take a [1, 200], skip a [0, ∞).

- [x] **Webhook acepta botId sin validar** — `webhook.controller.ts:28-50`
  - **Resuelto:** `66d83eb` — botId requerido, rechazo de bots pausados, eliminado fallback DEMO_BOT.

- [ ] **Org isolation duplicado 40+ veces** — `where: { bot: { orgId: user.orgId } }`
  - **Fix:** Extraer a utility `withOrgScope(user)`.

- [ ] **Error maps duplicados 15+ veces** — `Record<string, [number, string]>`
  - **Fix:** Centralizar en middleware de errores o utility.

- [x] **Operador `||` en lugar de `??` para nullable fields** — `bot.controller.ts`, `tool.controller.ts`, `finance.controller.ts`
  - **Resuelto:** `5f74d54` — `||` → `??` en templateId, flowId, membershipId.

- [ ] **console.log/error sin estructura** — PII en logs, sin correlation IDs.

- [x] **Path traversal frágil en uploads** — `upload.controller.ts:111-130`
  - **Resuelto:** `5a2e233` — Filename whitelist + resolve check defense-in-depth.

---

## 2. FRONTEND — Componentización

### Componentes que faltan crear

- [ ] **`Modal.astro`** — 10+ modales con estructura idéntica
  - `EditBotModal`, `CloneBotModal`, `PublicLinkModal`, `QRModal`, `ImportFlowModal`, `ForceAIModal`, `RunFlowModal`, `RunToolModal`, `ClientModal`, `InviteMemberModal`

- [ ] **`Button.astro`** (primary/secondary/danger) — 20+ variantes inline

- [ ] **`FormInput.astro`** (label + input + error) — 15+ instancias en modales, settings, clients

- [ ] **`Badge.astro`** (status pills) — 10+ instancias en `BotHeader`, `ToolsTab`, `campaigns`

- [ ] **`Tabs.astro`** — `TabBar.astro` tiene 9 tabs hardcodeados manualmente

### Componentes subutilizados

- [ ] **`EmptyState.astro`** — usado en 1 lugar, podría usarse en 8+
- [ ] **`ExpandableCard.astro`** — solo en ubicaciones específicas

### Patrones débiles

- [ ] **`x-html` para insertar HTML directo** (riesgo XSS) — `BotHeader.astro:48`, `QRModal.astro:15`
- [ ] **Alpine.js x-data enormes** (30+ propiedades) — `monitor.astro:82-150`
- [ ] **Sin loading states consistentes** en componentes data-fetching
- [ ] **Texto hardcodeado en español** sin pasar por i18n

---

## 3. ESTILOS — Migración a `@apply` / `@utility`

### Flow Editor (React) — 149 inline `style={{}}` objects

- [ ] **Colores hex hardcodeados** en lugar de usar tokens del tema
  - `#8696a0` (41x), `#00a884` (23x), `#202c33` (17x), `#2a3942` (24x)

- [ ] **Objetos de estilo duplicados** en 6+ archivos de panels/
  - `inputStyle`, `labelStyle`, `selectStyle`, `textareaStyle` — idénticos en cada archivo.

- [ ] **Crear `@utility` classes** para unificar:
  ```css
  @utility flow-input { @apply w-full bg-wa-bg-hover border border-wa-border px-2 py-1.5 text-white rounded-lg text-[10px] font-mono outline-none; }
  @utility flow-label { @apply text-wa-text-secondary text-[9px] block mb-1; }
  @utility btn-primary { @apply px-4 py-2 bg-wa-green text-white hover:bg-wa-green-hover transition-colors rounded-lg; }
  @utility btn-secondary { @apply px-4 py-2 border border-wa-border text-wa-text-secondary hover:bg-wa-bg-hover rounded-lg; }
  @utility btn-danger { @apply px-4 py-2 border border-red-500/30 text-red-500 hover:bg-red-500/10 rounded-lg; }
  ```

### Astro/Alpine — Tailwind classes repetidos

- [ ] **Strings largos de clases repetidos** en múltiples archivos para inputs, buttons, cards.
- [ ] **Inconsistencias de spacing** — gap values ad-hoc (2, 3, 4, 6, 8, 10, 12, 14px).

---

## Orden de ejecución

1. **CRÍTICO** — JWT secret fallback
2. **ALTO** — `as any` → validación tipada
3. **ALTO** — Rate limiting en auth
4. **ALTO** — Error handling específico (no catch-all)
5. **ALTO** — Service layer extraction
6. **MEDIO** — Bounds validation, org isolation utility, error maps centralizados
7. **FRONTEND** — Componentes UI base (Modal, Button, FormInput, Badge)
8. **ESTILOS** — @utility migration
