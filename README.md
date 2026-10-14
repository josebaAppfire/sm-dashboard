# SM Dashboard

Mini web local para el Scrum Master: burnup del sprint activo con datos reales de Jira.

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
> `BURNUP_TEAMS` define el selector de equipo del burnup (`Nombre:BoardId`). El nombre debe aparecer en el título de los sprints de Jira.
> `ESTIMATE_FIELD` es el campo de Story Points de tu Jira (varía entre instancias).

### 3. Crear el store de sprints

```bash
cp data/sprints.example.json data/sprints.json
```

`data/sprints.json` guarda el histórico de velocidad del equipo y está en `.gitignore`.
> `PORT` controla tanto el backend Express como el proxy de Vite hacia `/api`. Si el 3001 está ocupado, usa otro (p. ej. `3002`) y reinicia `npm run dev`.

### 4. Instalar dependencias y arrancar

```bash
npm install
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173).

## Cómo cambiar de sprint

Solo editar `SPRINT_ID` en `.env` y pulsar **Actualizar** en la web (o reiniciar el servidor).

## Estructura

```
sm-dashboard/
├── server/
│   ├── index.ts        — Express server con /api/burnup
│   ├── burnup.ts       — lógica GreenHopper + fallback REST
│   ├── jira-client.ts  — auth y fetch helpers
│   └── types.ts        — tipos compartidos
├── src/
│   ├── App.tsx
│   ├── components/BurnupChart.tsx
│   └── lib/
│       ├── api.ts      — fetch /api/burnup desde el cliente
│       └── types.ts    — re-exporta los tipos del servidor
└── .env.example
```

## Datos: GreenHopper vs fallback REST

El servidor intenta primero el endpoint interno de GreenHopper (`scopechangeburndownchart`), que
devuelve la serie temporal completa (mismo origen que la gráfica de Jira).

Si GreenHopper no está disponible o devuelve un error, se usa la Jira REST API oficial,
que solo puede mostrar los totales actuales (sin línea de progreso diario). La web muestra
un aviso amarillo en ese caso.

## Definición de "entregado"

Igual que en `metrics/velocity-history.md`:

- **Entregado = Done + Waiting for Release**

La stat "Done + Waiting for Release" usa esta definición.
La gráfica de Completado usa solo lo que GreenHopper marca como `done` en el board
(que puede diferir ligeramente según la configuración de columnas).
