# SM Dashboard

> **Idioma:** Español. Ver [README.md](README.md) para la versión en inglés.

Mini web local para el Scrum Master: velocidad calculada automáticamente desde Jira, vista del sprint activo con datos reales de Jira y ayudas de planning.

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
> `PORT` controla tanto el backend Express como el proxy de Vite hacia `/api`. Si el 3001 está ocupado, usa otro (p. ej. `3002`) y reinicia `npm run dev`.

### 3. Crear el store de sprints

```bash
cp data/sprints.example.json data/sprints.json
```

`data/sprints.json` guarda los datos que Jira no tiene (devs y días-persona por sprint, que se editan desde la pestaña Velocidad) y las referencias que usa la calculadora de Planning. Está en `.gitignore`.

### 4. Instalar dependencias y arrancar

```bash
npm install
npm run dev
```

Abrir [http://localhost:5173](http://localhost:5173).

El idioma de la interfaz (inglés / español) se cambia con el selector de la barra superior. La preferencia se guarda en el navegador (`localStorage`).

## Cómo cambiar de sprint

Editar `SPRINT_ID` en `.env` y pulsar **Actualizar** en la web (o reiniciar el servidor). En la pestaña burnup también puedes elegir sprint desde Jira si tienes equipos configurados.

## Estructura

```
sm-dashboard/
├── server/
│   ├── index.ts        — Express server (/api/*)
│   ├── burnup.ts       — totales del sprint y cambios de scope
│   ├── velocity-auto.ts — velocidad por sprint desde Jira
│   ├── jira-client.ts  — auth y fetch helpers
│   └── types.ts        — tipos compartidos
├── src/
│   ├── App.tsx
│   ├── components/VelocityPanel.tsx
│   └── lib/
│       ├── api.ts      — fetch /api desde el cliente
│       └── types.ts    — re-exporta los tipos del servidor
└── .env.example
```

## Datos: GreenHopper vs fallback REST

El servidor intenta primero el endpoint interno de GreenHopper (`scopechangeburndownchart`), que
devuelve la serie temporal completa (mismo origen que la gráfica de Jira).

Si GreenHopper no está disponible o devuelve un error, se usa la Jira REST API oficial,
que solo puede mostrar los totales actuales (sin línea de progreso diario). La web muestra
un aviso amarillo en ese caso.

## Pestaña Velocidad

Elige un equipo (de `BURNUP_TEAMS`) y cuántos sprints mostrar. Para cada sprint cerrado o activo de ese equipo, el servidor consulta Jira y calcula:

- **Comprometido:** SP de las issues que ya estaban en el sprint al empezar (reconstruido con el historial de cambios).
- **Alcance:** SP finales del sprint.
- **Entregado:** SP de las issues que estaban en Done o Waiting for Release al cerrar el sprint.

Las issues de L3 Support se excluyen (aparecen en una columna aparte). Devs y días-persona no existen en Jira: se escriben en la tabla y se guardan en `data/sprints.json`. Los resultados se cachean 10 minutos.

## Definición de "entregado"

Para velocidad y estadísticas relacionadas:

- **Entregado = Done + Waiting for Release**

La stat "Done + Waiting for Release" usa esta definición.
La gráfica de Completado usa solo lo que GreenHopper marca como `done` en el board
(que puede diferir ligeramente según la configuración de columnas).
