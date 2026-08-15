# CLAUDE.md — `apps/web`

Next.js (App Router). Es a la vez **la autoridad de servidor** y **la interfaz**. No
confundas las dos capas.

---

## Las tres capas

| Capa | Dónde | Puede | No puede |
|---|---|---|---|
| **Autoridad** | `app/api/**/route.ts` | `service_role`, escribir `game_states`, ejecutar `reduce()` | — |
| **Lectura** | Server Components | cliente Supabase de usuario (RLS activa), leer `player_views` | usar `service_role` |
| **Presentación** | Client Components | props, Realtime, `reduce()` **solo para preview** | decidir nada, persistir nada |

**Regla de import verificada por lint:** nada bajo `components/` puede importar
`lib/server/`.

## Seguridad

- `SUPABASE_SERVICE_ROLE_KEY` **solo** en Route Handlers. Nunca con prefijo
  `NEXT_PUBLIC_`. Hay un test de CI que falla si aparece en el bundle de cliente.
- El resultado de `reduce()` en el cliente **jamás** se envía ni se persiste. Es
  exclusivamente para pintar una previsualización.
- Toda entrada se valida con Zod y `.strict()`: un campo desconocido es **rechazo**, no
  se ignora.
- El cliente manda identificadores; las cantidades y el estado los pone el servidor.

---

## Mobile first, de verdad

Se diseña a **360×640 primero**. El escritorio es la misma interfaz con más aire — nunca
reglas distintas ni información distinta.

```
□ Objetivos táctiles ≥ 44 px (reales: 56 px)
□ Acciones primarias en el tercio inferior de la pantalla
□ Ningún panel oculta el mapa por completo
□ Un solo modal abierto a la vez
□ Sin desbordamiento horizontal a 320 px
□ Texto ≥ 14 px, contraste ≥ 4,5:1
```

Checklist completa en [`docs/UX_MOBILE.md §11`](../../docs/UX_MOBILE.md#11-checklist-de-qa-móvil).

## El mapa es SVG

No Canvas, no WebGL. Cada región es un elemento del DOM **enfocable y anunciable por
lector de pantalla** — la accesibilidad sale gratis y no se puede recuperar si migras a
Canvas.

Zoom y desplazamiento por `transform` sobre el `<g>` raíz, manipulado por ref. **No hagas
re-render de React durante un gesto.**

## Estado del cliente

Sin Redux, sin Zustand. Tres piezas y ninguna más:

1. Vista del servidor → Server Component o `useSyncExternalStore` sobre Realtime.
2. Órdenes en borrador → un `useReducer`. Es el único estado mutable real, y su forma es
   **exactamente** la que se envía a la API (sin transformación intermedia).
3. Preferencias de UI → `localStorage`. **Nada del estado de juego va aquí.**

## i18n

- **Cero literales visibles en componentes.** Regla de lint sobre `components/**`.
- Los errores de la API devuelven `code`, no texto; el cliente traduce.
- Las ofertas diplomáticas son **datos**, no frases: un jugador en español y otro en
  inglés ven la misma oferta.
- `es.json` y `en.json` deben tener exactamente el mismo conjunto de claves (test de CI).

## Rendimiento

| Presupuesto | Valor |
|---|---|
| JS de la ruta de partida (gzip) | ≤ 180 KB |
| LCP móvil | ≤ 2,5 s |
| INP al tocar una región | ≤ 100 ms |

**Prohibido el polling.** Realtime empuja; si el canal se cae, retroceso exponencial.

---

## Estado actual

**v0.1.** Prototipo local (hot seat): genera mapa, renderiza SVG, mueve fuerzas, resuelve
turnos simultáneos. Sin auth, sin base de datos, sin red — todo en memoria del navegador.

La capa de autoridad (`app/api/`) llega en **v0.3**. No la anticipes: el prototipo debe
poder tirarse sin arrastrar deuda.
