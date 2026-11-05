# Arranque del bridge sin falso error y `/status` ligero

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-bridge-start-and-status-spec`
- Role: spec
- Standalone: true
- Children: [01-ready-wait-and-light-status.md](../tickets/bridge-start-and-status/01-ready-wait-and-light-status.md)

## Tipo y objetivo
Bug. `/pi-web-ui start` falla en un perfil Pi completo aunque el bridge arranca bien unos
segundos después. Además, `/status` devuelve la sesión Pi entera. Objetivo: que `start` espere
lo que tarda de verdad el bridge y que `/status` devuelva solo el estado.

## Evidencia
- QA del 05/11 en Windows (Pi 1.5.0, bridge arrancado con Node desde el archivo del commit
  `1375d7c` instalado en el bundle `pi-personal-config`):
  - Con la espera por defecto, `start` lanzó `Bridge did not become ready on port 43199 within
    10000ms`. El proceso del bridge siguió vivo y contestó a `/status` poco después.
  - Con 120 s de margen, el bridge contestó a los **21 537 ms**.
  - `/status` devolvió **4 106 368 bytes**: el objeto `sdkSession` completo, con system prompt,
    modelo, herramientas y skills con sus rutas locales. El script de QA que lo consultaba en
    bucle terminó con `RangeError: Array buffer allocation failed`.
- `main()` en `src/bridge/server.ts` espera `app.ready` (la sesión del SDK, que carga todo el
  perfil Pi) antes de `listen`, así que `/status` no contesta hasta entonces.
  `READY_TIMEOUT_MS` en `src/pi-extension/bridge-process.ts` vale 10 000.
- `app.status()` devuelve `{ running, pid, port, browserClients, session, sdkSession }`, y
  `/status` lo serializa tal cual.
- Quién lee `/status`:
  - `defaultStatusProbe` en `bridge-process.ts`, que usa `pid` y `port`.
  - `bridge-client.js` de la extensión de Chrome, que usa `session.cwd`.
  - El test `sdk-session-integration.test.ts`, que solo comprueba que `sdkSession` existe.
  - Nadie lee el contenido de `sdkSession`.

## Decisiones
1. **Espera.** `READY_TIMEOUT_MS` pasa de 10 000 a 60 000, casi el triple de lo medido. El bridge
   sigue escuchando solo cuando la sesión está lista, y el seam `readyTimeoutMs` se queda.
2. **Contrato de `/status`.** `app.status()` deja de incluir `sdkSession` y gana
   `sdkReady: boolean`, que es `true` cuando la sesión del SDK existe. El resto de campos
   (`running`, `pid`, `port`, `browserClients`, `session`) no cambia. Es un cambio de contrato
   local: el cliente que lea `sdkSession` lo pierde, pero en los dos repos nadie lo hace.
3. **README.** Se documenta que `start` espera hasta 60 s porque el bridge carga primero el
   perfil Pi.

## Riesgos aceptados
- Si el bridge no llega a arrancar, `start` tarda hasta 60 s en avisar en lugar de 10.
- Tras un timeout, el proceso del bridge sigue vivo, como hasta ahora: un `start` posterior lo
  encuentra con `alreadyRunning`.

## Criterios de aceptación
- `app.status()` no tiene la propiedad `sdkSession`. `sdkReady` vale `false` antes de que se cree
  la sesión del SDK y `true` después. Su JSON no contiene el contenido de la sesión.
- Sin `readyTimeoutMs`, `start` acepta un bridge que contesta a los 20 s. Si no contesta en
  60 s, rechaza con `within 60000ms`.
- Los demás tests de `bridge-process` y del servidor no cambian de resultado.
- `dist/` reconstruido con `npm run build:dist`; `npm run check:dist` y el typecheck pasan.
- La suite completa no tiene fallos nuevos respecto de la base.
- El README documenta la espera.

## Alcance
`src/bridge/server.ts`, `src/pi-extension/bridge-process.ts`, `src/bridge/test/server.test.ts`,
`src/bridge/test/sdk-session-integration.test.ts`, `src/pi-extension/test/bridge-process.test.ts`,
`dist/`, `README.md`, esta spec y su ticket.

## No objetivos
- Escuchar antes de que la sesión esté lista, o informar del progreso del arranque.
- Matar el proceso del bridge tras un timeout.
- Cambiar la extensión de Chrome, que solo lee `session.cwd`.
- Abrir PR upstream o publicar en npm.

## Verificación
- Vitest en rojo antes y en verde después, en `server.test.ts`, `sdk-session-integration.test.ts`
  y `bridge-process.test.ts`, con timers simulados para la espera.
- Suite completa comparada con la base, typecheck, `check:dist`.
- En vivo: desde un archivo del commit nuevo instalado en un bundle limpio, `start` con la espera
  por defecto arranca el bridge, y `/status` mide pocos KB y no trae `sdkSession`.

## Gates
- Attempt: de la implementación al handoff, con commit y push a `main` del fork
  `carlitose/pi-web-ui`, el mismo flujo con el que se versionó `dist/` (`1375d7c`).
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: la respuesta «3» de Carlo (05/11) a la opción «Correggo nel fork i due
  problemi del bridge (attesa più lunga e `/status` leggero)». Sin Autopilot ni delegación.
- Open: PR upstream a `isr4el-silv4/pi-web-ui`. Push, PR y merge del pin en `pi-personal-config`.
  Actualización de los hosts y `/reload`.
- Exact version: none required.
- Existing blocks found: el repo no tiene CI. En la base `1375d7c` ya fallan 8 tests de Vitest:
  - 6 en `sdk-session.test.ts`;
  - `server.test.ts › handles side panel commands by updating session state`;
  - `web-ui-context.test.ts › theme returns a minimal theme object`.

  Se revisaron `server.ts`, `bridge-process.ts`, sus tests, el README y `bridge-client.js` de la
  extensión.

## Orden
1. Ticket 01.
