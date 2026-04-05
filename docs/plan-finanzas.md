# Plan: Modulo de Control Financiero ("Finanzas")

## Contexto

El negocio gestiona ~15 trabajadores que venden licencias. Necesitan responder dos preguntas: **"¿Cuanto dinero real me deja cada trabajador?"** y **"¿Ya somos rentables y puedo retirar ganancias?"**. Actualmente no existe ningun modulo financiero en Agentic — solo el tracking de estatus de clientes (licencias). Este modulo es 100% interno, sin integracion bancaria ni fiscal.

---

## 1. Modelos de Base de Datos (Prisma)

Archivo: `backend/prisma/schema.prisma`

### Enums nuevos
```
PeriodType    → WEEKLY, MONTHLY
PeriodStatus  → OPEN, CLOSED
```

### Modelos nuevos (6)

| Modelo | Proposito | Campos clave |
|--------|-----------|-------------|
| **Worker** | Trabajador del equipo | name, baseSalary (Float), bonusPercent (Float), bonusMinLicenses (Int), isActive |
| **BankAccount** | Cuenta bancaria (7 max) | name, bankName, identifier (ultimos 4), isActive |
| **FinancialPeriod** | Ciclo semanal/mensual | type (PeriodType), startDate, endDate, status (PeriodStatus) |
| **Income** | Ingreso manual | amount (Float), date, notes?, → bankAccountId, workerId, periodId |
| **Expense** | Gasto general (no nomina) | description, amount (Float), date → periodId |
| **WorkerPeriod** | Tracking por trabajador/periodo | campaignBudget (Float), licenseSales (Int), debtCarryOver (Float) → workerId, periodId. Unique(workerId, periodId) |

### Schema Prisma detallado

```prisma
enum PeriodType {
  WEEKLY
  MONTHLY
}

enum PeriodStatus {
  OPEN
  CLOSED
}

model Worker {
  id               String         @id @default(uuid())
  name             String
  baseSalary       Float
  bonusPercent     Float          @default(0)
  bonusMinLicenses Int            @default(0)
  isActive         Boolean        @default(true)
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
  incomes          Income[]
  workerPeriods    WorkerPeriod[]
}

model BankAccount {
  id         String   @id @default(uuid())
  name       String
  bankName   String
  identifier String
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  incomes    Income[]
}

model FinancialPeriod {
  id            String         @id @default(uuid())
  type          PeriodType
  startDate     DateTime
  endDate       DateTime
  status        PeriodStatus   @default(OPEN)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  incomes       Income[]
  expenses      Expense[]
  workerPeriods WorkerPeriod[]

  @@index([startDate, endDate])
  @@index([status])
}

model Income {
  id            String          @id @default(uuid())
  amount        Float
  bankAccountId String
  workerId      String
  periodId      String
  date          DateTime
  notes         String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  bankAccount   BankAccount     @relation(fields: [bankAccountId], references: [id])
  worker        Worker          @relation(fields: [workerId], references: [id])
  period        FinancialPeriod @relation(fields: [periodId], references: [id])

  @@index([periodId])
  @@index([workerId])
  @@index([bankAccountId])
  @@index([date])
}

model Expense {
  id          String          @id @default(uuid())
  description String
  amount      Float
  periodId    String
  date        DateTime
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  period      FinancialPeriod @relation(fields: [periodId], references: [id])

  @@index([periodId])
}

model WorkerPeriod {
  id             String          @id @default(uuid())
  workerId       String
  periodId       String
  campaignBudget Float           @default(0)
  licenseSales   Int             @default(0)
  debtCarryOver  Float           @default(0)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  worker         Worker          @relation(fields: [workerId], references: [id])
  period         FinancialPeriod @relation(fields: [periodId], references: [id])

  @@unique([workerId, periodId])
  @@index([periodId])
  @@index([workerId])
}
```

---

## 2. API Backend

Archivos nuevos:
- `backend/src/api/finance.controller.ts` — todos los metodos del controlador
- `backend/src/api/finance.routes.ts` — todas las rutas bajo `/finance`

Registro en: `backend/src/index.ts` via `.use(financeRoutes)`

### Endpoints (~25)

**Workers** `/finance/workers`
- GET `/` — listar (filtro `?active=true`)
- GET `/:id` — detalle
- POST `/` — crear (name, baseSalary, bonusPercent, bonusMinLicenses)
- PUT `/:id` — actualizar
- DELETE `/:id` — soft-delete (isActive=false)

**Cuentas Bancarias** `/finance/bank-accounts`
- GET `/` — listar
- POST `/` — crear
- PUT `/:id` — actualizar
- DELETE `/:id` — soft-delete

**Periodos** `/finance/periods`
- GET `/` — listar (filtro `?status=OPEN`)
- GET `/:id` — detalle con includes (incomes, expenses, workerPeriods)
- POST `/` — crear (type, startDate, endDate) + auto-crear WorkerPeriod por cada Worker activo
- POST `/:id/close` — cerrar periodo (calcular balances, arrastrar deudas)

**Ingresos** `/finance/incomes`
- GET `/?periodId=X` — listar (filtros: workerId, bankAccountId)
- POST `/` — crear (amount, bankAccountId, workerId, periodId, date, notes)
- PUT `/:id` — actualizar
- DELETE `/:id` — eliminar

**Gastos** `/finance/expenses`
- GET `/?periodId=X` — listar
- POST `/` — crear
- PUT `/:id` — actualizar
- DELETE `/:id` — eliminar

**Worker Periods** `/finance/worker-periods`
- GET `/?periodId=X` — listar con datos calculados
- PUT `/:id` — actualizar campaignBudget o licenseSales

**Dashboard** `/finance/dashboard`
- GET `/?periodId=X` — termometro global (totalIncome, totalInvestment, target, progress%, pureProfit, reachedTarget)
- GET `/reports/workers?periodId=X` — reporte por trabajador (income, cost, balance, bonus)
- GET `/reports/summary?periodId=X` — P&L global

---

## 3. Algoritmos Clave

### Break-even por trabajador
```
salarioPeriodo = baseSalary (mensual) | baseSalary/4.33 (semanal)
costoTotal = salarioPeriodo + campaignBudget + debtCarryOver
ingresoGenerado = SUM(incomes del worker en el periodo)
balance = ingresoGenerado - costoTotal
```

### Calculo de bono
```
if balance >= 0 AND licenseSales >= bonusMinLicenses:
  bono = balance * (bonusPercent / 100)
else:
  bono = 0
```

### Cierre de periodo
1. Marcar periodo como CLOSED
2. Para cada WorkerPeriod:
   - Calcular balance
   - Si balance < 0 → buscar/crear WorkerPeriod del siguiente periodo abierto → debtCarryOver = abs(balance)
3. Retornar resumen

### Termometro global (meta del 30%)
```
totalIncome = SUM(todos los incomes del periodo)
totalSalaries = SUM(baseSalary de workers activos), prorrateado si semanal
totalCampaigns = SUM(campaignBudget de workerPeriods del periodo)
totalExpenses = SUM(expenses del periodo)
totalInvestment = totalSalaries + totalCampaigns + totalExpenses
target = totalInvestment * 1.30
progress = (totalIncome / target) * 100
pureProfit = max(0, totalIncome - target)
reachedTarget = totalIncome >= target
```

---

## 4. Frontend

### Paginas nuevas (4)

| Pagina | Ruta | Contenido |
|--------|------|-----------|
| **Dashboard Financiero** | `/finance` | Termometro visual (barra de progreso), cards resumen (ingreso total, inversion, ganancia neta, ganancia pura), mini-tabla de ingresos por cuenta bancaria, alerta cuando se alcanza la meta |
| **Equipo** | `/finance/workers` | Tabla de trabajadores + modal crear/editar. Muestra: nombre, salario, % bono, umbral licencias, presupuesto campana del periodo actual |
| **Ingresos** | `/finance/income` | Tabla de ingresos del periodo + modal crear. Selects: cuenta bancaria, trabajador. Input: monto, fecha, notas |
| **Reportes** | `/finance/reports` | Selector de periodo. Tabla desglose por trabajador (ingreso, costo, deuda, balance, licencias, bono). Resumen P&L global |

### Navegacion
Agregar "Finanzas" al menu "Mas" en `frontend/src/components/Sidebar.astro` con icono de billete/grafica, entre Dashboard y Ads.

### Componentes
- Todas las paginas siguen el patron existente: `<Layout>` + Alpine.js `x-data` + `ApiClient` + `$t()`
- Modales con `bg-black/80` backdrop + form `@submit.prevent`
- Tablas con `<template x-for>`, loading skeletons, empty states
- Termometro: barra de progreso CSS con gradiente verde→dorado

### i18n
Agregar ~50 keys a `frontend/src/i18n/es.ts` y `frontend/src/i18n/en.ts` con prefijo `fin_`.

```javascript
// es.ts - keys nuevos
fin_title: "Control Financiero",
fin_dashboard: "Termometro",
fin_workers: "Equipo",
fin_income: "Ingresos",
fin_expenses: "Gastos",
fin_reports: "Reportes",
fin_bank_accounts: "Cuentas Bancarias",
fin_periods: "Periodos",
fin_total_income: "Ingreso Total",
fin_total_investment: "Inversion Total",
fin_target: "Meta (30%)",
fin_progress: "Progreso",
fin_pure_profit: "Ganancia Pura",
fin_net_profit: "Ganancia Neta",
fin_net_margin: "Margen Neto",
fin_target_reached: "Meta alcanzada! La ganancia a partir de aqui es utilidad pura.",
fin_below_target: "Falta para la meta",
fin_worker_name: "Nombre",
fin_base_salary: "Salario Base",
fin_bonus_percent: "% de Bono",
fin_bonus_threshold: "Min. Licencias para Bono",
fin_new_worker: "Nuevo Trabajador",
fin_edit_worker: "Editar Trabajador",
fin_no_workers: "Sin trabajadores registrados",
fin_campaign_budget: "Presupuesto de Campana",
fin_license_sales: "Ventas de Licencias",
fin_worker_cost: "Costo del Trabajador",
fin_worker_income: "Ingreso Generado",
fin_worker_balance: "Balance",
fin_debt_carry: "Deuda Arrastrada",
fin_bonus_earned: "Bono Ganado",
fin_broke_even: "Punto de Equilibrio",
fin_bank_name: "Banco",
fin_account_name: "Nombre de Cuenta",
fin_account_identifier: "Identificador (ultimos 4)",
fin_new_account: "Nueva Cuenta",
fin_no_accounts: "Sin cuentas registradas",
fin_amount: "Monto",
fin_date: "Fecha",
fin_notes: "Notas",
fin_worker: "Trabajador",
fin_bank_account: "Cuenta Bancaria",
fin_new_income: "Nuevo Ingreso",
fin_no_incomes: "Sin ingresos registrados",
fin_expense_desc: "Descripcion",
fin_new_expense: "Nuevo Gasto",
fin_no_expenses: "Sin gastos registrados",
fin_period_type: "Tipo de Periodo",
fin_weekly: "Semanal",
fin_monthly: "Mensual",
fin_annual: "Anual",
fin_start_date: "Fecha Inicio",
fin_end_date: "Fecha Fin",
fin_period_open: "Abierto",
fin_period_closed: "Cerrado",
fin_close_period: "Cerrar Periodo",
fin_close_period_confirm: "Al cerrar el periodo se calcularan balances y arrastres de deuda. Continuar?",
fin_new_period: "Nuevo Periodo",
fin_current_period: "Periodo Actual",
fin_pnl_summary: "Resumen P&L",
fin_per_worker: "Por Trabajador",
fin_total_salaries: "Total Salarios",
fin_total_campaigns: "Total Campanas",
fin_total_expenses: "Total Gastos",
fin_finance: "Finanzas",
```

---

## 5. Orden de Implementacion

### Fase 1: Schema + API base
1. Agregar modelos y enums al schema.prisma
2. Ejecutar `bunx prisma migrate dev`
3. Crear `finance.controller.ts` con CRUD de Workers, BankAccounts
4. Crear `finance.routes.ts` y registrar en `index.ts`

### Fase 2: Logica financiera
5. CRUD de Periods, Incomes, Expenses, WorkerPeriods
6. Endpoint de cierre de periodo con calculo de arrastre de deuda
7. Endpoint de dashboard/termometro
8. Endpoints de reportes

### Fase 3: Frontend base
9. Agregar keys de i18n
10. Agregar link "Finanzas" al Sidebar
11. Pagina `/finance/workers` (tabla + modales)
12. Pagina `/finance` (dashboard con termometro)

### Fase 4: Frontend completo
13. Pagina `/finance/income` (registro de ingresos)
14. Pagina `/finance/reports` (reportes por trabajador y P&L)
15. Gestion de cuentas bancarias (panel en dashboard o pagina aparte)
16. Gestion de gastos y periodos

---

## 6. Archivos criticos a modificar/crear

**Modificar:**
- `backend/prisma/schema.prisma` — agregar 6 modelos + 2 enums
- `backend/src/index.ts` — import + `.use(financeRoutes)` (~linea 248)
- `frontend/src/components/Sidebar.astro` — agregar link Finanzas al menu "Mas"
- `frontend/src/i18n/es.ts` — ~50 keys nuevos
- `frontend/src/i18n/en.ts` — ~50 keys nuevos

**Crear:**
- `backend/src/api/finance.controller.ts`
- `backend/src/api/finance.routes.ts`
- `frontend/src/pages/finance/index.astro` (dashboard)
- `frontend/src/pages/finance/workers.astro`
- `frontend/src/pages/finance/income.astro`
- `frontend/src/pages/finance/reports.astro`

**Patrones a seguir (referencia):**
- Controller: `backend/src/api/client.controller.ts` (object export, prisma import, Response errors)
- Routes: `backend/src/api/client.routes.ts` (Elysia prefix, authMiddleware, guard)
- Page: `frontend/src/pages/index.astro` (Layout, Alpine.js x-data, ApiClient)
- Table/Modal: patron de ClientList.astro / ClientModal.astro

---

## 7. Verificacion

1. `cd backend && bunx prisma migrate dev` — verificar que la migracion se aplica sin errores
2. `bun run dev` en backend — verificar que arranca sin errores
3. Probar CRUD de workers y bank-accounts con curl/Postman
4. Crear un periodo, registrar ingresos, verificar dashboard endpoint
5. Cerrar periodo y verificar arrastre de deuda
6. `npm run dev` en frontend — verificar que las paginas cargan
7. Registrar trabajadores, cuentas bancarias, ingresos desde la UI
8. Verificar que el termometro refleja los datos correctamente
