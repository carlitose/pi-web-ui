---
ticket_schema: 1
ticket_id: "01"
execution_mode: AFK
blocked_by: []
---

# Bridge: espera de arranque realista y `/status` sin la sesión SDK

## Artifact Graph
- Artifact ID: `artifact:pi-web-ui-bridge-start-and-status-01`
- Role: `ticket`
- Parent: [bridge-start-and-status.md](../../specs/bridge-start-and-status.md)

## Parent Spec
[bridge-start-and-status.md](../../specs/bridge-start-and-status.md)

## What to Build
`READY_TIMEOUT_MS` a 60 000 en `bridge-process.ts`. `app.status()` sin `sdkSession` y con `sdkReady: boolean`. `dist/` reconstruido y README actualizado. Spec: Decisiones 1–3 y Criterios de aceptación.

## Acceptance Criteria
- [ ] `app.status()` no tiene `sdkSession`. `sdkReady` vale `false` antes de crear la sesión del SDK y `true` después, y el JSON no contiene el contenido de la sesión.
- [ ] Sin `readyTimeoutMs`, `start` acepta un bridge que contesta a los 20 s y rechaza con `within 60000ms` si no contesta en 60 s.
- [ ] Los demás tests de `bridge-process` y del servidor no cambian de resultado.
- [ ] `npm run build:dist`, `npm run check:dist` y `npm run typecheck` pasan.
- [ ] La suite completa no tiene fallos nuevos respecto de la base `1375d7c` (8 fallos ya existentes).
- [ ] README: `start` espera hasta 60 s.

## Frontier
Ready.

## Gates
- Attempt: de la implementación al handoff, con commit y push a `main` del fork `carlitose/pi-web-ui`.
- Budget per attempt: none set.
- Time per attempt: none set.
- Maximum attempts: none set.
- Approvals given: la respuesta «3» de Carlo (05/11) a «Correggo nel fork i due problemi del bridge».
- Open: PR upstream; push, PR y merge del pin en `pi-personal-config`; actualización de los hosts y `/reload`. No bloquean este ticket.
- Exact version: none required.
- Existing blocks found: sin CI; 8 fallos de Vitest en la base (ver la spec).

## Step-by-Step Implementation Plan
1. Tests en rojo: `server.test.ts` (`sdkReady: false`), `sdk-session-integration.test.ts` (`sdkReady: true`, sin `sdkSession` ni contenido de sesión), `bridge-process.test.ts` (espera por defecto con timers simulados: acepta a los 20 s, rechaza a los 60 s).
2. `server.ts`: `status()` con `sdkReady`.
3. `bridge-process.ts`: `READY_TIMEOUT_MS = 60000`.
4. README, `npm run build:dist`, verificación.

## Testing Plan
Vitest focalizado en rojo y en verde; suite completa contra la base; typecheck; `check:dist`. En vivo, desde un bundle limpio con el commit nuevo: arranque con la espera por defecto y tamaño de `/status`.

## Out of Scope
- Escuchar antes de que la sesión esté lista; matar el bridge tras un timeout.
- La extensión de Chrome.
