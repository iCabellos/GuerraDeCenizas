# Despliegue

> Cómo se pone esto en producción y cómo se comprueba que quedó bien.
> Todo con capas gratuitas: Vercel Hobby + Supabase Free.

---

## Índice

1. [Lo que hay que crear](#1-lo-que-hay-que-crear)
2. [Supabase](#2-supabase)
2bis. [El pipeline](#2-bis-el-pipeline)
3. [Vercel](#3-vercel)
4. [El reloj](#4-el-reloj)
5. [Comprobación posterior](#5-comprobación-posterior)
6. [Lo que puede salir mal](#6-lo-que-puede-salir-mal)
7. [Presupuesto del free tier](#7-presupuesto-del-free-tier)

---

## 1. Lo que hay que crear

| Servicio | Plan | Para qué |
|---|---|---|
| Supabase | Free | Postgres, Auth, Realtime, `pg_cron` |
| Vercel | Hobby | Next.js, Route Handlers |

Nada más. Sin Redis, sin cola de mensajes, sin servidor de sockets: el estado vive en
Postgres y el empuje lo hace Realtime sobre las mismas tablas.

---

## 2. Supabase

### 2.1 Migraciones

**Las aplica el pipeline** ([§2 bis](#2-bis-el-pipeline)) en cada cambio bajo `supabase/`
que llegue a `main`. A mano, para un proyecto nuevo o para depurar:

```bash
npx supabase link --project-ref TU-REF
npx supabase db push
```

Se aplican en orden alfabético. `0007_schedule.sql` se salta solo si `pg_cron` no está
disponible, así que no hace falta tratarlo aparte.

Comprobar que la niebla de guerra quedó puesta:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by tablename;
```

**Todas** deben tener `rowsecurity = true`. Y `game_states` debe tener **cero** políticas:

```sql
select count(*) from pg_policies
 where schemaname = 'public' and tablename = 'game_states';   -- 0
```

Si ese número no es cero, alguien añadió una política a la tabla que nadie puede leer y
la niebla de guerra acaba de dejar de existir.

### 2.2 Auth

**Esto ya no se toca en el panel.** Vive en [`supabase/config.toml`](../supabase/config.toml)
y lo empuja el pipeline con `supabase config push`. El panel es el resultado, no la fuente:
un cambio hecho a mano allí se pierde en el siguiente despliegue.

| Ajuste | Valor | Por qué |
|---|---|---|
| `site_url` | el dominio de producción | Es la lista blanca de redirecciones **y** el destino de respaldo |
| `additional_redirect_urls` | callback de producción, comodín de preview, `localhost` | Los preview de Vercel cambian de dominio en cada rama |
| `enable_anonymous_sign_ins` | `true` | El modo invitado |
| `enable_confirmations` | `true` | Ya estaba así antes de versionarlo |

**Este ajuste fue un fallo real y silencioso.** El correo de alta llegaba con
`redirect_to=http://localhost:3000`: confirmar la cuenta mandaba a una máquina que no
existe. La causa no estaba en el código — Supabase **solo acepta un `redirect_to` que esté
en su lista blanca**, y cuando no lo está lo sustituye sin avisar por la Site URL, que de
fábrica es `http://localhost:3000`. No hay error en ningún log, no hay test que lo pueda
cazar y el enlace parece correcto. Por eso la configuración está ahora en el repositorio:
para que la próxima vez el fallo sea imposible en lugar de invisible.

### 2.3 Realtime

Panel → Database → Replication: `player_views`, `games`, `messages` y `treaties` deben
estar en la publicación `supabase_realtime`. Las migraciones lo hacen, pero conviene
mirarlo: si falta `player_views`, el juego funciona y **nadie se entera de que su turno
ha resuelto** hasta que recarga.

`game_states` **no** está en la publicación, y eso es deliberado. Realtime respeta RLS,
así que tampoco filtraría nada — pero una tabla que nadie puede leer no tiene por qué
estar publicada.

---

## 2 bis. El pipeline

Todo lo de arriba —migraciones, ajustes de Auth y los secretos del reloj— lo aplica
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) cuando llega a `main` un
cambio bajo `supabase/`. La aplicación la sigue desplegando Vercel por su cuenta; este
workflow es la mitad que Vercel no toca.

**Por qué automatizarlo y no dejarlo documentado.** Los tres pasos manuales que sustituye
comparten una propiedad desagradable: **no fallan ruidosamente**.

| Si falta | Qué se ve | Qué pasa de verdad |
|---|---|---|
| Migraciones | la aplicación arranca | se cae al primer `select` |
| `site_url` | el correo llega y el enlace parece bueno | te manda a `http://localhost:3000` |
| Secretos del vault | `pg_cron` late, sin errores | llama con `Authorization` vacío, recibe 401, y las partidas con ausencias no avanzan |

Ninguno de los tres lo puede cazar un test, porque ninguno vive en el repositorio.

### Qué hace, en orden

1. Comprueba que están las seis piezas de configuración. Falla **antes** de tocar nada y
   dice cuál falta por su nombre — lo mismo que hace `/api/health` para la aplicación.
2. `supabase db push --dry-run`, para dejar en el log qué se va a aplicar.
3. `supabase db push`: migraciones **y** los secretos del vault, que salen de `[db.vault]`
   en `config.toml`.
4. `supabase config push`: `site_url`, la lista blanca de redirecciones y las sesiones
   anónimas.
5. Comprueba el resultado: que `pg_cron` tiene el trabajo programado, que el vault tiene
   sus dos secretos y que **`game_states` sigue con RLS activa y cero políticas**. Esta
   última para el despliegue si falla: es donde vive la niebla de guerra
   ([ADR-006](DECISIONS.md#adr-006)), y una política añadida por descuido no rompe ningún
   test — solo enseña la partida entera a todo el mundo.

### Lo que hay que configurar una vez

En **Settings → Environments → `production`**:

| | Nombre | Valor |
|---|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN` | token personal, panel de Supabase → Account → Access Tokens |
| Secret | `SUPABASE_DB_PASSWORD` | la contraseña de la base de datos |
| Secret | `CRON_SECRET` | **el mismo valor** que `CRON_SECRET` en Vercel |
| Variable | `SUPABASE_PROJECT_REF` | la referencia del proyecto |
| Variable | `GDC_SITE_URL` | `https://TU-APP.vercel.app`, sin barra final |
| Variable | `GDC_PREVIEW_URL_PATTERN` | `https://TU-APP-*.vercel.app/**` |

`CRON_SECRET` tiene que coincidir en los dos sitios. Son los dos extremos del mismo
secreto compartido: si no coinciden, el reloj queda parado y no lo dice nadie.

### Verificación

[`.github/workflows/verify.yml`](../.github/workflows/verify.yml) ejecuta `npm run verify`
en cada pull request. Es el mismo comando de siempre; lo que no había era quien lo
ejecutara, así que las reglas bloqueantes del proyecto —los tests de RLS, la regla de oro
de la metaprogresión, `core` sin dependencias— dependían de que alguien se acordara. Una
regla bloqueante que depende de la memoria no es bloqueante.

Añade un paso más al final: buscar la clave de servicio en el bundle compilado.
`check:deps` mira el código fuente; esto mira lo que de verdad se sirve al navegador.

---

## 3. Vercel

### 3.1 Configuración del proyecto

**Root Directory = `apps/web`**, con «Include source files outside of the Root Directory
in the Build Step» **activado**. Los dos ajustes, no uno.

| Ajuste | Valor |
|---|---|
| **Framework Preset** | **Next.js** — compruébalo, no des por hecho que se detectó |
| Root Directory | `apps/web` |
| Include files outside Root Directory | ✅ **obligatorio** |
| **Build Command** | **Override → `npm run build`** |
| Install command | por defecto — Vercel detecta los workspaces e instala en la raíz |

**El Framework Preset no se corrige solo.** La detección ocurre **una vez, al crear el
proyecto**, mirando el Root Directory de ese momento. Si el proyecto se creó con el Root
Directory vacío, Vercel miró la raíz del repositorio, no encontró Next y guardó el preset
como **«Other»** — y cambiar el Root Directory después **no vuelve a lanzarla**. El preset
se queda como estaba, para siempre, hasta que alguien lo cambia a mano.

**El Build Command hay que forzarlo.** Con el preset de Next, Vercel puede ejecutar
`next build` directamente, y eso **se salta el `prebuild`**: vuelve el
`Module not found: './art/generated'`. Escribiendo `npm run build` en el Override se
ejecuta el `prebuild` sí o sí.

**De dónde sale el preset «Other».** Vercel detecta el framework mirando el Root
Directory: busca ahí `next` entre las dependencias y un `next.config.*`. En la raíz de
este repositorio no hay ninguna de las dos cosas —es solo el nodo de workspaces, sin una
sola dependencia de runtime—, así que si el proyecto se creó sin Root Directory la
detección falló y quedó **«Other»**, que espera una carpeta `public/`. De ahí este error,
que no menciona Next por ninguna parte:

```
No Output Directory named "public" found after the Build completed.
```

Es engañoso: la compilación **ha ido bien**. Lo que falla es que Vercel nunca supo que
esto era una aplicación de Next.

Y ojo: **arreglar el Root Directory no arregla el preset.** Son dos ajustes distintos en
la misma pantalla, y el segundo se queda en «Other» hasta que se cambia a mano. Es el
error que más tiempo costó de los tres.

Y no se arregla desde el repositorio. Un `vercel.json` con `framework` y `outputDirectory`
**no** vale: para Next.js, Vercel usa la Build Output API y el ajuste de directorio de
salida no se aplica. Se intentó y falló. Hay que fijar el Root Directory.

**Por qué hace falta la casilla.** Dos cosas del build viven fuera de `apps/web`:
`packages/core`, porque el motor se consume como fuente TypeScript sin compilar
([ADR-022](DECISIONS.md#adr-022)), y `tools/assets/`, que genera los componentes de arte
en el `prebuild`. Sin la casilla, ninguno de los dos llega a la máquina de build.

**El `prebuild`.** `npm run build` genera los assets antes de compilar. Están en
`.gitignore` porque son un artefacto, así que un clon limpio no los trae y sin ese paso la
compilación falla con `Module not found: './art/generated'`.

### 3.2 Variables de entorno

Copiar de [`.env.example`](../.env.example):

| Variable | Entorno | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | todos | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | todos | pública, RLS la contiene |
| `SUPABASE_SECRET_KEY` | todos | ⚠ **nunca** con prefijo `NEXT_PUBLIC_` |
| `CRON_SECRET` | todos | cadena larga y aleatoria; **el mismo valor** que en el pipeline |
| `NEXT_PUBLIC_SITE_URL` | producción | el dominio público, sin barra final |

`NEXT_PUBLIC_SITE_URL` es la mitad del cliente del arreglo del enlace a localhost: es la
URL que se pide como `redirect_to`. La otra mitad —que Supabase la acepte— la pone
`config.toml` ([§2.2](#22-auth)). Si se omite, se usa el dominio de producción que Vercel
inyecta sola, que casi siempre es el correcto; declararla explícitamente evita el «casi».

**Las dos generaciones de claves de Supabase valen.** El panel sugiere hoy
`sb_publishable_…` y `sb_secret_…`; los proyectos anteriores tienen JWT (`eyJ…`) bajo los
nombres `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. Cambia el nombre,
no el rol —la publicable sigue siendo `anon` y la secreta `service_role`—, así que
`apps/web/lib/server/env.ts` acepta los cuatro nombres y prefiere el nuevo si están los
dos. No hace falta tocar ninguna política de RLS.

La clave secreta omite RLS: con ella se lee `game_states` entero. Si acabara en el bundle
de cliente, la niebla de guerra sería decorativa para cualquiera que abra las herramientas
de desarrollo. Hay una regla estructural (`npm run check:deps`) que falla si cualquiera de
sus dos nombres aparece fuera de `apps/web/lib/server/`, y un test que comprueba que
ninguno lleva prefijo `NEXT_PUBLIC_`.

**Si una clave se expone —un pantallazo, un chat, un log—, se rota.** Panel → *API Keys* →
*Rotate*, y se actualiza el valor en Vercel. Rotar la secreta es especialmente urgente:
quien la tenga lee el estado completo de todas las partidas con una petición HTTP.

---

## 4. El reloj

Vercel Hobby permite **un cron diario**, lo que no sirve para turnos de tres minutos. El
reloj vive en Supabase ([ADR-014](DECISIONS.md#adr-014)): `pg_cron` llama cada minuto a
`/api/cron/resolve-due` a través de `pg_net`.

**Los dos secretos los pone el pipeline** ([§2 bis](#2-bis-el-pipeline)) desde
`[db.vault]` en `config.toml`, y comprueba después que están. A mano, si hiciera falta,
desde el SQL Editor:

```sql
select vault.create_secret('https://TU-APP.vercel.app/api/cron/resolve-due',
                           'gdc_resolve_url');
select vault.create_secret('EL-MISMO-VALOR-QUE-CRON_SECRET-EN-VERCEL',
                           'gdc_cron_secret');
```

Los secretos van al *vault* y no dentro de la función porque el cuerpo de una función de
`cron.job` es legible desde el catálogo.

Comprobar que late:

```sql
select jobname, schedule, active from cron.job where jobname = 'gdc-resolve-due';
select status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 10;
```

**El reloj es el segundo de tres disparadores**, no el único. El 85 % de los turnos los
resuelve el último jugador que envía sus órdenes, y cualquier petición de cliente que
detecte un plazo vencido lo resuelve también. Que `pg_cron` falle un rato ralentiza las
partidas con ausencias; no las bloquea.

---

## 5. Comprobación posterior

**Empieza por aquí.** Una sola petición dice si el despliegue está configurado:

```bash
curl -s https://TU-APP.vercel.app/api/health
```

```json
{ "ok": true, "missing": [], "engine": "0.2.0", "mapgen": "0.1.0" }
```

Si devuelve **503**, `missing` trae los nombres de las variables que faltan. Devuelve
nombres y nunca valores — y esos nombres ya están en `.env.example`, así que no revela
nada que no esté en el repositorio.

Existe porque costó una tarde: con una variable sin definir, la aplicación respondía
`Internal Server Error` y nada más. El mensaje explícito estaba en el log de una función
que hay que saber buscar.

Y después, antes de invitar a nadie:

```
□ /api/health responde 200 con missing vacío
□ Un correo de acceso llega y el enlace entra directo a la ciudad
□ La ciudad se dibuja con el emblema de tu facción y es la MISMA al recargar
□ Buscar campaña deja la cuenta en cola; se ven las ciudades pendientes parpadear
□ Una segunda cuenta buscando lo mismo forma la partida y AMBAS entran solas ← Realtime
□ Cada asiento ve un mapa distinto                                     ← niebla
□ GET /rest/v1/game_states con la clave anónima devuelve 401 o vacío   ← RLS
□ Enviar órdenes desde todos los asientos resuelve el turno al instante
□ Dejar vencer un plazo sin enviar resuelve el turno igual             ← pg_cron
□ Una cuenta sola en cola acaba emparejada con Mando Automático        ← pg_cron
□ cron.job_run_details no acumula errores
```

La quinta y la sexta son las que de verdad importan. Si `game_states` responde algo con
la clave anónima, **hay que parar el despliegue**: el resto del juego funciona igual con
la niebla rota, y por eso nadie lo notaría.

```bash
# Debe devolver 401 o una lista vacía. Nunca filas.
curl -s "$SUPABASE_URL/rest/v1/game_states?select=*" \
     -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

---

## 6. Lo que puede salir mal

| Síntoma | Causa probable |
|---|---|
| El enlace del correo lleva a un error de Supabase | Falta la URL en *Redirect URLs* |
| El enlace del correo lleva a `http://localhost:3000` | `site_url` sin configurar. Supabase sustituye **en silencio** un `redirect_to` que no esté en la lista blanca por su Site URL, y de fábrica es localhost. Lo arregla `config.toml` + el pipeline ([§2.2](#22-auth)) |
| «Entrar sin cuenta» no hace nada | `enable_anonymous_sign_ins` en `false`. Está en `config.toml`; lo empuja el pipeline |
| Entras y vuelves a la pantalla de acceso, en bucle | Usuario en `auth.users` sin fila en `profiles`. Lo crea un trigger desde la migración `0009`; si la base es anterior, aplicar migraciones |
| El turno resuelve pero nadie se entera hasta recargar | `player_views` no está en `supabase_realtime` |
| `Internal Server Error` en todo el sitio | Falta alguna variable de entorno. **Consulta `/api/health`**: dice cuáles en una petición. Falla a propósito — un servidor a medias que responde 500 en mitad de una partida es mucho peor de depurar |
| Los turnos vencidos no resuelven | Secretos del *vault* mal puestos, o `CRON_SECRET` distinto entre Vercel y Supabase |
| Build en Vercel: no encuentra `@gdc/core` | Falta `--include-workspace-root` en el *install* |
| Build en Vercel: `Module not found: './art/generated'` | El *build command* no pasa por `npm run build`. Los componentes de arte son un artefacto generado y no están versionados; los crea el `prebuild` |
| `No Output Directory named "public" found` | **Framework Preset en «Other»**, que espera `public/`. La compilación fue correcta. Corregir el Root Directory **no** cambia el preset: hay que ponerlo a Next.js a mano. Ver §3.1 |
| Vuelve `Module not found: './art/generated'` tras poner el preset de Next | Vercel está ejecutando `next build` en vez de `npm run build`, así que se salta el `prebuild`. Forzar el *Build Command* a `npm run build` |
| Se entra a la ciudad pero buscar campaña no hace nada | `matchmaking_queue` sin migrar, o `/api/match` devolviendo 500. Mirar los logs de la función |
| Una partida se queda «resolviendo» | Un arrendamiento colgado. Vence solo en 30 s ([ADR-025](DECISIONS.md#adr-025)); si persiste, mirar los errores de `/api/cron/resolve-due` |

---

## 7. Presupuesto del free tier

| Recurso | Límite | Consumo estimado |
|---|---|---|
| Postgres | 500 MB | ≈ 80 KB por partida terminada ⇒ ~6 000 partidas |
| Realtime | 200 conexiones concurrentes | ≈ 40 partidas de 5 a la vez |
| Peticiones de Vercel | 100 GB-h | Muy por debajo: casi todo son lecturas con RLS |
| `pg_cron` | sin límite práctico | 1 llamada/minuto |

El punto de ruptura conocido son las **200 conexiones de Realtime**
([DISCOVERY T7](DISCOVERY.md#22-riesgos-técnicos)). Con cadencia Diaria casi nadie está
conectado a la vez, así que el límite solo aprieta en Blitz. Cuando se acerque, la salida
documentada es agrupar canales por partida en vez de por asiento.
