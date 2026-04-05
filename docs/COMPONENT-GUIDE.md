# Component & Style Guide — Agentic Frontend

> Referencia para mantener consistencia visual y evitar duplicación de patrones.

---

## Arquitectura de Estilos

```
frontend/src/styles/
  global.css          ← Entry point: @theme tokens, @imports, html/body reset
  scrollbar.css       ← Webkit scrollbar customization
  chat.css            ← Wallpaper, bubble tails, date pills, check marks
  flow-editor.css     ← fe-input, fe-textarea, fe-select, fe-label utilities
```

**Regla:** cada dominio tiene su propio archivo CSS. Nuevos features crean su archivo y lo importan desde `global.css`.

### Design Tokens (@theme)

| Token | Valor | Uso |
|-------|-------|-----|
| `--color-wa-green` | `#00a884` | Primary actions, active states |
| `--color-wa-green-hover` | `#06cf9c` | Hover sobre primary |
| `--color-wa-bg-deep` | `#0b141a` | Fondo base de la app |
| `--color-wa-bg-panel` | `#111b21` | Cards, modales, paneles |
| `--color-wa-bg-header` | `#202c33` | Headers, navbars |
| `--color-wa-bg-hover` | `#2a3942` | Inputs, hovers, fondos interactivos |
| `--color-wa-text-primary` | `#e9edef` | Texto principal (blanco suave) |
| `--color-wa-text-secondary` | `#8696a0` | Labels, texto secundario |
| `--color-wa-border` | `#2a3942` | Bordes de cards, inputs, divisores |
| `--color-wa-danger` | `#ea4335` | Errores, acciones destructivas |
| `--color-wa-info` | `#53bdeb` | Links, info badges |

### CSS Utilities (Flow Editor — React)

Estas clases reemplazan los inline `style={{}}` en componentes React del flow editor:

| Clase | Equivale a |
|-------|------------|
| `fe-input` | Input full-width, bg-hover, border, mono 11px |
| `fe-textarea` | Igual que fe-input + resize vertical, padding 8px |
| `fe-select` | Igual que fe-input para `<select>` |
| `fe-label` | Label gris 9px, block, margin-bottom 4px |

Uso en JSX: `<input className="fe-input" />` — no inline styles.

---

## Componentes UI Compartidos

### `<Modal>`

```astro
---
import Modal from "../ui/Modal.astro";
---
<Modal show="showMyModal" maxWidth="max-w-md" variant="center" dismissible>
    <h2>Titulo</h2>
    <p>Contenido</p>
</Modal>
```

| Prop | Tipo | Default | Descripcion |
|------|------|---------|-------------|
| `show` | `string` | requerido | Expresion Alpine que controla visibilidad |
| `maxWidth` | `string` | `"max-w-md"` | Clase de ancho maximo |
| `variant` | `"center" \| "sheet"` | `"center"` | `sheet` = bottom sheet en mobile |
| `dismissible` | `boolean` | `true` | Click en backdrop y Escape cierran |

### `<Button>`

```astro
---
import Button from "../ui/Button.astro";
---
<Button variant="primary" size="md" type="submit" disabled>
    Guardar
</Button>
```

| Prop | Tipo | Default | Opciones |
|------|------|---------|----------|
| `variant` | `string` | `"primary"` | `primary`, `secondary`, `danger`, `ghost` |
| `size` | `string` | `"md"` | `sm`, `md`, `lg` |
| `type` | `string` | `"button"` | `button`, `submit`, `reset` |

Variantes visuales:
- **primary**: verde (`bg-wa-green`), texto blanco
- **secondary**: borde gris, texto secundario
- **danger**: borde rojo, texto rojo
- **ghost**: sin fondo, texto secundario, hover gris

### `<FormInput>`

```astro
---
import FormInput from "../ui/FormInput.astro";
---
<FormInput label="Email" type="email" placeholder="user@example.com" required />
```

| Prop | Tipo | Default |
|------|------|---------|
| `label` | `string` | — |
| `type` | `string` | `"text"` |
| `placeholder` | `string` | — |
| `required` | `boolean` | `false` |

Atributos HTML adicionales se pasan directo al `<input>`.

### `<Badge>`

```astro
---
import Badge from "../ui/Badge.astro";
---
<Badge color="green" size="sm">Active</Badge>
```

| Prop | Tipo | Default | Opciones |
|------|------|---------|----------|
| `color` | `string` | `"gray"` | `green`, `red`, `yellow`, `blue`, `gray` |
| `size` | `string` | `"sm"` | `sm`, `md` |

### `<Toggle>`

Toggle switch simple. Usar con Alpine `x-model`.

### `<EmptyState>`

Placeholder centrado con borde dashed. Usar cuando una lista esta vacia.

### `<AutoTextarea>`

Textarea que crece automaticamente con el contenido.

| Prop | Tipo | Default |
|------|------|---------|
| `placeholder` | `string` | — |
| `rows` | `number` | — |
| `minHeight` | `string` | — |

### `<ExpandableCard>`

Card colapsable con titulo y toggle Alpine.

| Prop | Tipo | Default |
|------|------|---------|
| `cardKey` | `string` | requerido |
| `title` | `string` | — |
| `titleExpr` | `string` | — (Alpine expression alternativa) |

---

## Inventario Completo de Componentes

### UI Primitivos (`ui/`) — 8 componentes
| Componente | Descripcion |
|-----------|-------------|
| Modal | Overlay con backdrop, escape, click-outside |
| Button | Botones con variantes de color y tamano |
| FormInput | Input con label integrado |
| Badge | Pill de status con colores |
| Toggle | Switch on/off |
| EmptyState | Placeholder para listas vacias |
| AutoTextarea | Textarea auto-expandible |
| ExpandableCard | Card colapsable |

### Auth (`auth/`) — 5 componentes
| Componente | Descripcion |
|-----------|-------------|
| AuthCard | Layout de pagina de auth con header "Agentic ID" |
| AuthInput | Input con binding Alpine para auth |
| AuthButton | Submit button con estado de carga |
| AuthError | Display de mensaje de error |
| AuthLink | Link estilizado verde |

### Detail (`detail/`) — 15 componentes
| Componente | Descripcion |
|-----------|-------------|
| BotHeader | Header de detalle con badge de plataforma y acciones |
| TabBar | Navegacion de tabs (8 tabs) |
| AIConfigTab | Config de IA con herencia de template |
| FlowsTab | Grid/lista de flows con busqueda |
| LabelsTab | Gestion de labels de WhatsApp |
| ToolsTab | Lista de tools built-in y custom |
| AutomationsTab | Lista de automations con toggles |
| VariablesTab | Variables del bot y selector de template |
| NotificationsTab | Config de canales de notificacion |
| LogsTab | Logs de ejecucion filtrables |
| EditBotModal | Modal para editar nombre/identificador |
| QRModal | Modal con codigo QR para conexion |
| CloneBotModal | Modal para clonar bot |
| PublicLinkModal | Modal con link publico copiable |
| ImportFlowModal | Modal para importar flows de otros bots |

### Monitor (`monitor/`) — 9 componentes
| Componente | Descripcion |
|-----------|-------------|
| SessionList | Lista de sesiones/chats con busqueda |
| ChatHeader | Header de chat con avatar, nombre, acciones |
| MessageList | Feed de mensajes con scroll y separadores |
| ChatInput | Input de mensaje con attachments y reply |
| NotesPanel | Panel colapsable de notas |
| DebugPanel | Modal de debug con contexto AI |
| ForceAIModal | Modal sheet para inyectar contexto AI |
| RunFlowModal | Modal sheet para ejecutar flow |
| RunToolModal | Modal sheet para ejecutar tool |

### Clients (`clients/`) — 2 componentes
| Componente | Descripcion |
|-----------|-------------|
| ClientList | Lista de clientes con acciones |
| ClientModal | Modal para crear cliente |

### Settings (`settings/`) — 2 componentes
| Componente | Descripcion |
|-----------|-------------|
| MemberList | Lista de miembros con roles y asignaciones |
| InviteMemberModal | Modal para invitar miembros |

### Skeletons (`skeletons/`) — 4 componentes
| Componente | Descripcion |
|-----------|-------------|
| BotDetailSkeleton | Placeholder animado para detalle de bot |
| TemplateDetailSkeleton | Placeholder para detalle de template |
| MonitorSessionsSkeleton | Placeholder para lista de sesiones |
| LogsSkeleton | Placeholder para tabla de logs |

### Editor (`editor/`) — 6 componentes Astro
| Componente | Descripcion |
|-----------|-------------|
| FlowSettings | Panel de settings de flow (limites, cooldown) |
| StepAddBar | Toolbar para agregar tipos de step |
| StepTimeConfig | Config de step condicional por hora |
| StepToolConfig | Selector de tool para step |
| TriggerCard | Card de trigger con scope/match type |
| StepCard | Card de step con drag, tipo, delay, jitter |

### Flow Editor (`flow-editor/`) — 16 componentes React
| Componente | Descripcion |
|-----------|-------------|
| FlowEditorProvider | Context provider con estado del editor |
| FlowEditorIsland | Astro island entry point |
| FlowCanvas | Canvas ReactFlow con nodos y auto-layout |
| Toolbar | Barra flotante con tipos de step |
| BaseStepNode | Nodo base con handles y header |
| TextNode | Nodo de texto con preview |
| ToolNode | Nodo de tool con badge |
| MediaNode | Nodo de media con color por tipo |
| ConditionalTimeNode | Nodo con ramas de horario |
| TriggerNode | Nodo de trigger con conteo |
| StepDetailPanel | Panel lateral de detalle de step |
| TextStepForm | Editor de contenido de texto |
| ToolStepForm | Formulario de configuracion de tool |
| TimeStepForm | Editor de ramas de tiempo |
| TriggerPanel | Panel de gestion de triggers |
| FlowSettingsPanel | Settings a nivel de flow |
| MediaStepForm | Picker de URL/variable de media |

### Root Level — 5 componentes
| Componente | Descripcion |
|-----------|-------------|
| BotConnection | Panel de conexion con SSE para QR y status |
| FinanceNav | Tabs de navegacion del modulo de finanzas |
| HelpNav | Tabs de navegacion de ayuda |
| MediaPicker | Modal de upload/seleccion de media |
| Sidebar | Barra de navegacion inferior (role-based) |

---

## Estadisticas

- **Total: 72 componentes** (56 Astro + 16 React)
- **8 primitivos UI** compartidos
- **10 modales** — todos usan `<Modal>` y `<Button>`
- **4 skeletons** para loading states

---

## Convenciones

1. **Nuevos modales** usan `<Modal>` + `<Button>` — no escribir wrapper manual
2. **Botones** usan `<Button variant="...">` — no clases inline de bg-wa-green
3. **Inputs en Astro** pueden usar `<FormInput>` o las clases directas si necesitan mas control
4. **Inputs en React** (flow editor) usan `className="fe-input"` / `"fe-textarea"` / `"fe-select"`
5. **Labels** en React usan `className="fe-label"`
6. **Status badges** usan `<Badge color="..." size="...">`
7. **CSS nuevo** va en su propio archivo bajo `styles/`, importado desde `global.css`
