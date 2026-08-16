# Despliegue

> Cómo se pone esto en producción y cómo se comprueba que quedó bien.
> Todo con capas gratuitas: Vercel Hobby + Supabase Free.

---

## Índice

1. [Lo que hay que crear](#1-lo-que-hay-que-crear)
2. [Supabase](#2-supabase)
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

Panel → Authentication → Providers:

- **Email** activado, **Confirm email** activado.
- Desactivar todo lo demás. Cada proveedor añadido es superficie que hay que mantener.

Panel → Authentication → URL Configuration:

```
Site URL       https://TU-APP.vercel.app
Redirect URLs  https://TU-APP.vercel.app/auth/callback
               http://localhost:3000/auth/callback
```

Sin la URL de retorno en la lista, el enlace del correo lleva a una pantalla de error de
Supabase y el jugador no tiene forma de saber por qué.

### 2.3 Realtime

Panel → Database → Replication: `player_views`, `games`, `messages` y `treaties` deben
estar en la publicación `supabase_realtime`. Las migraciones lo hacen, pero conviene
mirarlo: si falta `player_views`, el juego funciona y **nadie se entera de que su turno
ha resuelto** hasta que recarga.

`game_states` **no** está en la publicación, y eso es deliberado. Realtime respeta RLS,
así que tampoco filtraría nada — pero una tabla que nadie puede leer no tiene por qué
estar publicada.

---

## 3. Vercel

### 3.1 Configuración del proyecto

**Root Directory = `apps/web`**, con «Include source files outside of the Root Directory
in the Build Step» **activado**. Los dos ajustes, no uno.

| Ajuste | Valor |
|---|---|
| Framework | Next.js (se detecta solo) |
| Root Directory | `apps/web` |
| Include files outside Root Directory | ✅ **obligatorio** |
| Install command | por defecto — Vercel detecta los workspaces e instala en la raíz |
| Build command | por defecto (`npm run build`) |

**Por qué el Root Directory no puede quedarse sin fijar.** Vercel detecta el framework
mirando el Root Directory: busca ahí `next` entre las dependencias y un `next.config.*`.
En la raíz de este repositorio no hay ninguna de las dos cosas —es solo el nodo de
workspaces, sin una sola dependencia de runtime—, así que la detección falla y cae al
preset **«Other»**, que espera una carpeta `public/`. De ahí este error, que no menciona
Next por ninguna parte:

```
No Output Directory named "public" found after the Build completed.
```

Es engañoso: la compilación **ha ido bien**. Lo que falla es que Vercel nunca supo que
esto era una aplicación de Next.

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
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | todos | pública, RLS la contiene |
| `SUPABASE_SERVICE_ROLE_KEY` | todos | ⚠ **nunca** con prefijo `NEXT_PUBLIC_` |
| `CRON_SECRET` | todos | cadena larga y aleatoria |

`SUPABASE_SERVICE_ROLE_KEY` omite RLS: con ella se lee `game_states` entero. Si acabara
en el bundle de cliente, la niebla de guerra sería decorativa para cualquiera que abra
las herramientas de desarrollo. Hay una regla estructural (`npm run check:deps`) que falla
si aparece fuera de `apps/web/lib/server/`.

---

## 4. El reloj

Vercel Hobby permite **un cron diario**, lo que no sirve para turnos de tres minutos. El
reloj vive en Supabase ([ADR-014](DECISIONS.md#adr-014)): `pg_cron` llama cada minuto a
`/api/cron/resolve-due` a través de `pg_net`.

Una sola vez por proyecto, desde el SQL Editor:

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

Antes de invitar a nadie:

```
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
| El turno resuelve pero nadie se entera hasta recargar | `player_views` no está en `supabase_realtime` |
| «Falta la variable de entorno …» al arrancar | Variable sin definir en Vercel. Falla al arrancar a propósito: un servidor a medias que responde 500 en mitad de una partida es mucho peor de depurar |
| Los turnos vencidos no resuelven | Secretos del *vault* mal puestos, o `CRON_SECRET` distinto entre Vercel y Supabase |
| Build en Vercel: no encuentra `@gdc/core` | Falta `--include-workspace-root` en el *install* |
| Build en Vercel: `Module not found: './art/generated'` | El *build command* no pasa por `npm run build`. Los componentes de arte son un artefacto generado y no están versionados; los crea el `prebuild` |
| `No Output Directory named "public" found` | *Root Directory* sin fijar. Vercel no detecta Next —en la raíz no hay `next.config.*` ni dependencias— y cae al preset «Other», que espera `public/`. La compilación fue correcta. Ver §3.1 |
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
