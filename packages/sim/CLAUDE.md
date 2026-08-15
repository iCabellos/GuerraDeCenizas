# CLAUDE.md — `packages/sim`

Simulador de balance: juega partidas completas **sin interfaz, sin red y sin base de
datos**, usando el mismo `reduce()` que el servidor.

## Reglas

### Los bots juegan con `PlayerView`, no con `GameState`

Un bot que vea el estado completo hace trampas, y **todas las conclusiones de balance
quedan invalidadas**. Los perfiles deciden con exactamente la misma información que
tendría un humano en ese asiento.

### Nada de lógica de juego aquí

Si necesitas una regla, está en `@gdc/core`. Este paquete solo contiene **políticas de
decisión** (qué órdenes emite un perfil) y **agregación de estadísticas**.

### Reproducibilidad

Toda ejecución acepta `--seed`. La misma semilla y los mismos perfiles deben producir el
mismo informe, byte a byte.

## Uso

```bash
npm run sim -- --games 5000 --players 5 --seed 1 --out reports/balance.json
npm run sim:sweep -- --param combat.counterK --range 0.20:0.50:0.05 --games 1000
```

## El informe diagnostica, no vuelca datos

Cada métrica tiene un objetivo declarado en
[`docs/TESTING_AND_SIMULATION.md §6.4`](../../docs/TESTING_AND_SIMULATION.md#64-métricas).
El informe debe **marcar automáticamente** lo que sale de rango. Un volcado de números
que alguien tiene que interpretar a mano no sirve de nada en una ejecución nocturna.

## Límite reconocido

El simulador mide si la **aritmética** de la diplomacia funciona (¿está bien tarifada la
traición? ¿es alcanzable la consagración?). **No** mide si la diplomacia es divertida:
los bots negocian con funciones de utilidad, no con psicología. Eso solo lo dice el
playtesting con humanos. No presentes un resultado del simulador como si dijera más de lo
que dice.

## Estado actual

**Sin implementar.** Llega en v0.8 (ver [ROADMAP](../../docs/ROADMAP.md)). Se puede
adelantar parcialmente en cuanto el motor tenga combate y economía (v0.2).
