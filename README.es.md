# SM Dashboard

> **Idioma:** Español. Ver [README.md](README.md) para la versión en inglés.

Mini web local para el Scrum Master con tres pestañas:

- **Velocidad:** SP comprometidos, alcance y entregados por sprint, calculados desde Jira.
- **Planning:** techo de SP y compromiso conservador para el próximo sprint, a partir de un sprint de referencia y la disponibilidad del equipo.
- **Sprint:** cycle time de las issues del equipo, totales del sprint, planificación inicial y cambios de scope, con datos reales de Jira.

## Requisitos

- Node 18+ (el proyecto usa `fetch` nativo)
- Acceso a Jira Cloud con permisos de lectura en el proyecto

## Setup inicial (una sola vez)

### 1. Crear un API token de Atlassian

1. Ir a [Atlassian Account → Security → API tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Hacer clic en **Create API token**
3. Ponerle un nombre descriptivo, por ejemplo `sm-dashboard-local`
4. Copiar el token (no se puede volver a ver después)

### 2. Crear el archivo `.env`

```bash
cp .env.example .env
```

Editar `.env` con tus datos:

```env
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=you@your-company.com
JIRA_API_TOKEN=ATATTxxxxxxxx...
BOARD_ID=123
BURNUP_TEAMS=TeamA:123,TeamB:456
SPRINT_ID=1000
ESTIMATE_FIELD=customfield_10016
PORT=3001
```

> El `.env` está en `.gitignore` — nunca se sube al repo.
> `BURNUP_TEAMS` define el selector de equipo de todas las pestañas (`Nombre:BoardId`). El nombre debe aparecer en el título de los sprints de Jira.
> `ESTIMATE_FIELD` es el campo de Story Points de tu Jira (varía entre instancias).
> `PORT` controla tanto el backend Express como el proxy de Vite hacia `/api`. Si el 3001 está ocupado, usa otro (p. ej. `3002`) y reinicia `npm run dev`.

### 3. Crear el store de sprints

```bash
cp data/sprints.example.json data/sprints.json
```

`data/sprints.json` guarda los datos que Jira no tiene: devs y días-persona por sprint, que se editan desde la pestaña Velocidad y usa la pestaña Planning. Está en `.gitignore`.

### 4. Instalar dependencias y arrancar

```bash
npm install
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173).

El idioma de la interfaz (inglés / español) se cambia con el selector de la barra superior. La preferencia se guarda en el navegador (`localStorage`).

## Cómo elegir el sprint

En la pestaña **Sprint**, elige el equipo y uno de sus últimos sprints de Jira (por defecto, el activo). `SPRINT_ID` del `.env` solo se usa como respaldo si no se puede cargar la lista de sprints.

## Estructura

```
sm-dashboard/
├── server/
│   ├── index.ts         — Express server (/api/*)
│   ├── burnup.ts        — totales del sprint, planificación inicial y cambios de scope
│   ├── cycle-time.ts    — cycle time de las issues del equipo
│   ├── velocity-auto.ts — velocidad por sprint desde Jira
│   ├── store.ts         — store data/sprints.json y cálculo de planning
│   ├── teams.ts         — lectura de BURNUP_TEAMS
│   ├── jira-client.ts   — auth y fetch helpers
│   └── types.ts         — tipos compartidos
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── VelocityPanel.tsx
│   │   ├── PlanningCalculator.tsx
│   │   ├── CycleTimeChart.tsx, SprintTotals.tsx
│   │   └── InitialIssuesPanel.tsx, ScopeChangesPanel.tsx
│   └── lib/
│       ├── api.ts       — fetch /api desde el cliente
│       └── types.ts     — re-exporta los tipos del servidor
└── .env.example
```

## Pestaña Velocidad

Elige un equipo (de `BURNUP_TEAMS`) y cuántos sprints mostrar. Para cada sprint cerrado o activo de ese equipo, el servidor consulta Jira y calcula:

- **Comprometido:** SP de las issues que ya estaban en el sprint al empezar (reconstruido con el historial de cambios). No cuentan las issues creadas después del inicio, como las sub-tareas.
- **Alcance:** SP finales del sprint.
- **Entregado:** SP de las issues que estaban en Done o Waiting for Release al cerrar el sprint.

Las issues de L3 Support se excluyen (aparecen en una columna aparte). Devs y días-persona no existen en Jira: se escriben en la tabla y se guardan en `data/sprints.json`.

### Devs y días-persona

- **Devs:** número de desarrolladores que trabajaron en el sprint.
- **Días-persona:** suma de los días que trabajó realmente cada dev durante el sprint, es decir, días laborables del sprint − ausencias (vacaciones, baja, formación…). Por ejemplo, 5 devs en un sprint de 10 días laborables, con uno de ellos 2 días de vacaciones: 5 × 10 − 2 = **48 días-persona**.

Son importantes porque son la medida de la capacidad que tuvo el equipo en ese sprint. Los SP entregados solo se pueden comparar entre sprints si se sabe con cuánta gente se consiguieron: 40 SP con 50 días-persona no es lo mismo que 40 SP con 35.

La pestaña Planning usa los días-persona del sprint de referencia para escalar su velocidad a la disponibilidad del próximo sprint. **Un sprint sin días-persona registrados no se puede usar como referencia en Planning**: aparece desactivado en el desplegable. Conviene rellenarlos al cerrar cada sprint, mientras aún se recuerdan las ausencias.

El servidor cachea los datos de Jira 10 minutos. **Actualizar** se salta esa caché y vuelve a consultar Jira, así que un sprint que acabas de cerrar aparece al momento.

## Pestaña Planning

Usa los mismos controles de equipo, número de sprints y **Actualizar** que la pestaña Velocidad, y los mismos datos de Jira.

1. **Sprint de referencia:** lista de sprints cerrados con sus SP entregados. Por defecto se elige el último que tenga días-persona. Los sprints sin días-persona aparecen desactivados: rellénalos en la pestaña Velocidad (ver [Devs y días-persona](#devs-y-días-persona)).
2. **Disponibilidad:** días laborables del sprint, devs en el equipo, devs disponibles este sprint y ausencias por dev. Días netos de cada dev = días laborables − ausencias.
3. **Resultado**, recalculado al momento:
   - Capacidad histórica = días-persona disponibles ÷ días-persona de la referencia, y capacidad teórica = días-persona disponibles ÷ (devs en el equipo × días laborables).
   - **Techo** = SP de referencia × capacidad histórica.
   - **Compromiso conservador** = techo × (100 − margen) / 100. El margen es un 8% por defecto.

Los SP de referencia y el margen se editan directamente en el panel de resultado. El botón ↺ restablece los SP entregados según Jira. La pestaña también calcula el % de SP planificados vinculados a los goals del sprint.

`GET /api/planning?devDays=N&reference=SPRINT_ID` devuelve el mismo cálculo, con los parámetros opcionales `referenceDelivered` y `conservativePct` (92 por defecto).

## Pestaña Sprint

- **Cycle time:** tiempo activo en estados de la categoría "In Progress" de las issues del equipo entregadas en el rango de fechas elegido, con mediana, P85 y media. Las issues se seleccionan por el campo Appfire Team; se excluyen las épicas y se incluye L3 Support. También se puede comparar con el tiempo transcurrido (primer In Progress → entrega).
- **Totales del sprint:** alcance, Done y Done + Waiting for Release.
- **Planificación inicial:** issues que estaban en el sprint al empezar. Se excluyen las creadas después del inicio.
- **Cambios de scope:** issues añadidas o re-estimadas (más o menos SP) durante el sprint, con los SP completados y pendientes de esos cambios.

Los chips de épica filtran el cycle time y los totales del sprint.

## Definición de "entregado"

Para velocidad, planning y estadísticas relacionadas:

- **Entregado = Done + Waiting for Release**
