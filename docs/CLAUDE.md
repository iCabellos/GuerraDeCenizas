# CLAUDE.md — `docs/`

La documentación de este proyecto **no es un resumen del código: es su especificación**.
El código se escribió después de estos documentos y debe seguir coincidiendo con ellos.

## Reglas

### Si el código y el documento discrepan, uno de los dos está mal — arréglalo

No dejes que se separen. Un documento que miente es peor que no tener documento, porque
alguien tomará una decisión basándose en él.

### Las decisiones se registran, no se editan

En `DECISIONS.md`, si una decisión cambia se añade **una entrada nueva** que sustituye a
la anterior, y la vieja se marca `sustituida por ADR-0XX`. El historial de por qué se
decidió algo vale tanto como la decisión.

### Formato de un ADR

```
Contexto  → qué problema obliga a decidir
Decisión  → qué se decide, en una frase
Consecuencias → ✅ lo que ganamos · ⚠️ lo que cuesta y cómo se mitiga
Descartado → qué alternativas y por qué no
```

La sección **Descartado** es obligatoria. Sin ella, dentro de seis meses alguien
propondrá la alternativa que ya se rechazó.

### Los números de balance llevan ⚖️

Marca así todo valor provisional que deba calibrar el simulador. Sin la marca, alguien lo
tratará como sagrado.

### Enlaces

Se verifican en CI: `npm run docs:check` comprueba que cada enlace apunta a un archivo y
a un ancla que existen. Usa el mismo algoritmo de anclas que GitHub, así que un enlace
válido aquí lo es también navegando el repositorio en la web.

**Los acentos se conservan en las anclas**: `#investigación`, no `#investigacion`.

### PDF

`npm run docs:pdf` regenera `docs/GuerraDeCenizas.pdf`. **Hazlo en el mismo commit** en
el que cambies documentación: el PDF está versionado porque se comparte con gente que no
va a clonar el repositorio.

## Mapa de documentos

| Documento | Cuándo leerlo |
|---|---|
| `DISCOVERY.md` | Antes de proponer «¿y si añadimos…?» — puede que ya se descartara |
| `GAME_DESIGN.md` | Cualquier cosa que toque reglas del juego |
| `TECHNICAL_DESIGN.md` | Base de datos, API, seguridad, concurrencia |
| `MAP_GENERATION.md` | `packages/core/src/mapgen/` |
| `FACTIONS.md` | Facciones, cuentas, desbloqueos |
| `DIPLOMACY.md` | Tratados, ofertas, reputación |
| `METAPROGRESSION.md` | Ciudad, desbloqueos, la regla de oro |
| `MULTIPLAYER.md` | Turnos, cadencias, ausencias, reconexión |
| `UX_MOBILE.md` | Cualquier cosa con interfaz |
| `ASSET_PIPELINE.md` | Cualquier cosa visual |
| `TESTING_AND_SIMULATION.md` | Antes de escribir tests |
| `ROADMAP.md` | Antes de empezar cualquier tarea |
| `DECISIONS.md` | Antes de contradecir algo |
