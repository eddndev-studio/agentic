# Hardening Report — Agentic

Fecha: 2026-04-04
Ultima actualizacion: 2026-04-04

---

## Progreso General

| Area | Resueltos | Pendientes | Total |
|------|-----------|------------|-------|
| Backend — Critico | 1/1 | 0 | 1 |
| Backend — Alto | 4/5 | 1 | 5 |
| Backend — Medio | 4/7 | 3 | 7 |
| Frontend — Componentes | 5/8 | 3 | 8 |
| Frontend — Patrones | 0/4 | 4 | 4 |
| Estilos — Flow Editor | 2/3 | 1 | 3 |
| Estilos — Astro/Alpine | 0/2 | 2 | 2 |
| **Total** | **16/30** | **14** | **30** |

---

## 1. BACKEND — Patrones Debiles

### CRITICO (1/1 resuelto)

- [x] **JWT secret hardcodeado como fallback** — `auth.middleware.ts:9`, `events.controller.ts:8`
  - **Resuelto:** `252736c` — `envRequired('JWT_SECRET')` en config.ts, fail en startup.

### ALTO (4/5 resueltos)

- [x] **`as any` en 31 instancias** — bodies sin type safety
  - **Resuelto:** `022b944` — Todos reemplazados con Typebox schemas.

- [x] **Sin rate limiting en auth** — `/auth/login`, `/auth/register`, `/auth/forgot-password`
  - **Resuelto:** `5c75a9e` — Rate limiter Redis (sliding window).

- [x] **Catch-all genericos** — 83+ instancias que tragan errores reales
  - **Resuelto:** `ae168f6` — `handlePrismaError()` utility + `catch (e: unknown)`.

- [ ] **Sin service layer** — Controllers mezclan HTTP + validacion + logica + queries Prisma
  - `bot.controller.ts` (clone: 295-403), `flow.controller.ts` (import/export: 293-389), `session.controller.ts` (chat context: 238-281)
  - **Fix:** Extraer a `FlowService`, `BotService`, `SessionService`, etc.
  - **Nota:** Refactor estructural grande. Mejor hacerlo por controller incrementalmente.

### MEDIO (4/7 resueltos)

- [x] **Sin validacion de bounds en limit/offset** — `execution.controller.ts:54-55`
  - **Resuelto:** `68f8351` — Clamp take a [1, 200], skip >= 0.

- [x] **Webhook sin validar botId** — `webhook.controller.ts:28-50`
  - **Resuelto:** `66d83eb` — botId requerido, rechazo bots pausados, eliminado fallback DEMO_BOT.

- [x] **`||` en lugar de `??` para nullable fields**
  - **Resuelto:** `5f74d54` — templateId, flowId, membershipId.

- [x] **Path traversal fragil en uploads** — `upload.controller.ts:111-130`
  - **Resuelto:** `5a2e233` — Filename whitelist + resolve check defense-in-depth.

- [ ] **Org isolation duplicado 40+ veces** — `where: { bot: { orgId: user.orgId } }`
  - **Fix:** Extraer a utility `withOrgScope(user)`.

- [ ] **Error maps duplicados 15+ veces** — `Record<string, [number, string]>`
  - **Fix:** Centralizar en utility o middleware.

- [ ] **console.log/error sin estructura** — PII en logs, sin correlation IDs.

---

## 2. FRONTEND — Componentizacion

### Componentes creados (5/8 resueltos)

- [x] **`Modal.astro`** — 10 modales migrados
  - **Resuelto:** `0bf6635` + `806ec53`
  - Variantes: `center` (default) y `sheet` (bottom sheet en mobile)
  - Migrados: EditBot, QR, InviteMember, CloneBot, PublicLink, ImportFlow, ForceAI, RunFlow, RunTool, Client.

- [x] **`Button.astro`** — primary/secondary/danger/ghost con sizes sm/md/lg
  - **Resuelto:** `0bf6635`

- [x] **`FormInput.astro`** — label + input + HTML spread
  - **Resuelto:** `0bf6635`

- [x] **`Badge.astro`** — status pills con 5 colores y 2 tamanos
  - **Resuelto:** `0bf6635`

- [ ] **`Tabs.astro`** — `TabBar.astro` tiene 9 tabs hardcodeados manualmente

- [ ] **`EmptyState.astro`** — existe pero se usa en 1 solo lugar (podria usarse en 8+)

- [ ] **`ExpandableCard.astro`** — existe pero infrautilizado

### Patrones debiles (0/4 resueltos)

- [ ] **`x-html` para insertar HTML directo** (riesgo XSS) — `BotHeader.astro:48`, `QRModal.astro:15`
- [ ] **Alpine.js x-data enormes** (30+ propiedades) — `monitor.astro:82-150`
- [ ] **Sin loading states consistentes** en componentes data-fetching
- [ ] **Texto hardcodeado en espanol** sin pasar por i18n

---

## 3. ESTILOS

### Arquitectura (resuelto)

- [x] **CSS modularizado** — `919cb3f`
  - `global.css` → entry point con @theme + @imports
  - `scrollbar.css` → webkit scrollbar
  - `chat.css` → wallpaper, bubbles, date pills
  - `flow-editor.css` → fe-input, fe-textarea, fe-select, fe-label

### Flow Editor React (2/3 resueltos)

- [x] **Objetos de estilo duplicados en panels/** — `14c27ac`
  - Eliminados inputStyle/selectStyle/labelStyle/textareaStyle de 7 archivos.

- [x] **`@utility` classes creadas** — `14c27ac`
  - fe-input, fe-textarea, fe-select, fe-label.

- [ ] **142 inline `style={{}}` restantes** en nodes/ y FlowEditorIsland.tsx
  - Son layout styles (flex, gap, padding). Extraer solo los repetidos.

### Astro/Alpine (0/2 resueltos)

- [ ] **Strings largos de clases repetidos** — inputs (18 archivos), buttons (28 archivos), labels (53 archivos), cards (38 archivos)
  - **Solucion:** Adoptar `<Button>`, `<FormInput>`, `<Badge>`, `<Modal>` en mas lugares. Ver `docs/COMPONENT-GUIDE.md`.

- [ ] **Inconsistencias de spacing** — gap values ad-hoc (2, 3, 4, 6, 8, 10, 12, 14px)

---

## Referencia

- **Guia de componentes y estilos:** [`docs/COMPONENT-GUIDE.md`](COMPONENT-GUIDE.md)
- **Utilities creadas:** `frontend/src/styles/flow-editor.css`
- **Prisma error handler:** `backend/src/utils/prisma-errors.ts`
- **Rate limiter:** `backend/src/middleware/rate-limit.middleware.ts`
