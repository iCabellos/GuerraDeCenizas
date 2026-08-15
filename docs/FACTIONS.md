# Sistema de facciones

> **Versión:** 1.0 · Implementación: `packages/core/src/factions/`
> Decisión: [ADR-021](DECISIONS.md#adr-021)
> Extiende [METAPROGRESSION](METAPROGRESSION.md) y las ciudades signatarias del
> [GDD §2.4](GAME_DESIGN.md#24-las-ciudades-signatarias).

---

## 1. Qué es una facción, y qué no es

La facción es **la identidad permanente de la cuenta**: a qué ciudad signataria has
jurado. No es una elección por partida como la doctrina; es a quién perteneces.

| La facción **sí** determina | La facción **no** determina |
|---|---|
| Tu identidad visual y tu nombre | Ninguna estadística |
| Con qué doctrina empiezas | Qué doctrinas puedes llegar a tener |
| Qué desbloqueos te salen **más baratos** | Qué desbloqueos existen para ti |
| Tu vía de progresión (**el orden**) | Tu techo (**es el mismo para todos**) |
| Un vínculo público con otros de tu facción | Ninguna ventaja mecánica por ese vínculo |

### 1.1 El invariante

> **Dos cuentas al máximo, de facciones distintas, tienen exactamente el mismo conjunto
> de opciones disponibles.**

La facción cambia **el camino**, nunca **el destino**. Esto es lo que la mantiene
compatible con la regla de oro de la metaprogresión
([ADR-009](DECISIONS.md#adr-009)) y con el juego competitivo.

Verificado por test: `factions/no-ceiling-difference`.

### 1.2 ¿Qué decisión interesante permite?

La pregunta obligatoria del proyecto ([brief §36](GAME_DESIGN.md)). Tres respuestas:

1. **Al crear la cuenta**: *«¿qué tipo de jugador quiero ser primero?»* — tu facción te
   pone en las manos una doctrina concreta y abarata una vía. Los primeros 5–10
   campañas se juegan de forma distinta según a quién juraste.
2. **Al progresar**: *«¿profundizo en mi facción o pago el precio completo por salirme?»*
   Especializarte es barato; diversificar cuesta. Ninguna es la respuesta correcta.
3. **Dentro de la partida**: *«hay otro de Koldvik en esta mesa, y todos lo saben»* —
   la **Concordia** es información pública que cambia la lectura diplomática sin dar
   nada mecánico.

---

## 2. Las seis facciones

Las seis ciudades signatarias del lore. Cada una: una doctrina de origen, dos doctrinas
afines, tres anomalías afines, y un rasgo de identidad.

| Facción | Origen | Doctrinas afines | Anomalías afines | Identidad |
|---|---|---|---|---|
| **Vantera** | El Libro | El Libro · Mortaja | Sello · Eco · Fulgor | Puerto mediador. Vive de arbitrar entre los demás. |
| **Koldvik** | Yunque | Yunque · Cuña | Ancla · Éxodo · Velo | Complejo industrial subártico. Nunca dejó de fabricar. |
| **Saranth** | Coro | Coro · El Libro | Fisura · Pliegue · Fulgor | Enclave de investigación. Sabe demasiado sobre la Ceniza. |
| **Meridia** | Cuña | Cuña · Enjambre | Pliegue · Éxodo · Ancla | Metrópolis logística. Todo en movimiento. |
| **Oshara** | Mortaja | Mortaja · Coro | Velo · Eco · Fisura | Ciudad-delta. Nadie tiene su mapa completo. |
| **Tarn** | Enjambre | Enjambre · Yunque | Ancla · Fulgor · Sello | Ciudad minera. La primera que halló Ceniza en veta. |

**Cobertura verificada por test:** cada doctrina es afín a exactamente 2 facciones, cada
anomalía a 2 o 3, y cada doctrina es el origen de exactamente una facción. Nadie queda
huérfano y nadie está sobrerrepresentado.

### 2.1 Lo que se lleva de inicio

Toda cuenta nueva, sea cual sea su facción, empieza con:

- **1 doctrina** — la de origen de su facción (distinta según la facción).
- **3 anomalías** — `Velo`, `Ancla`, `Eco` para todos. Idénticas.
- **Su ciudad** como estética.

Las anomalías iniciales son las mismas para todos **a propósito**: son las tres más
fáciles de entender, y el onboarding no debe depender de a quién juraste.

---

## 3. Economía de desbloqueo

Un desbloqueo cuesta **Ceniza depositada** (§3 de [METAPROGRESSION](METAPROGRESSION.md#3-moneda-la-ceniza-depositada)).

```
coste(clave, facción) = COSTE_BASE[clave] × (esAfín(clave, facción) ? 0.6 : 1.0)   ⚖️
```

**Solo hay descuento. No hay penalización.** Se consideró encarecer lo ajeno (×1.25) y se
descartó: introduciría la sensación de «mi facción es peor para X», que es exactamente lo
que la regla de oro quiere evitar. Lo afín es más barato; lo demás cuesta lo normal.

| Clave | Coste base ⚖️ | Con afinidad |
|---|:-:|:-:|
| Doctrina | 90 ✦ | 54 ✦ |
| Anomalía | 70 ✦ | 42 ✦ |
| Ciudad (estética) | 55 ✦ | — |
| Distrito nivel 1 / 2 / 3 | 30 / 60 / 110 ✦ | — |

Consecuencia práctica: completar **tu vía de facción** (2 doctrinas + 3 anomalías) cuesta
`54 + 126 = 180 ✦` frente a los `300 ✦` que costaría el mismo conjunto siendo ajeno.
Aproximadamente **9 campañas de diferencia** — sensible, pero no un muro.

### 3.1 El techo es el mismo

Desbloquearlo **todo** cuesta lo mismo para toda facción salvo por el descuento, que es
del mismo tamaño para todas (2 doctrinas + 3 anomalías afines). El orden en que llegas
difiere; el destino no.

---

## 4. Concordia: la facción dentro de la partida

Cuando dos o más jugadores de la **misma facción** coinciden en una campaña, el sistema
lo declara públicamente en el Parlamento:

```
  ⟡ CONCORDIA — Koldvik
    Vosotros (asiento 0) y Rhea (asiento 3) habéis jurado a la misma ciudad.
```

**Efecto mecánico: ninguno.** Absolutamente ninguno. No hay bonificación, no hay tratado
automático, no hay visión compartida, no hay coste de ruptura reducido ni aumentado.

**Efecto real:** los otros tres jugadores lo saben. Y ahora tienen que decidir si asumen
que vosotros dos vais a aliaros — mientras vosotros decidís si aprovechar esa suposición o
desmentirla.

> Es información pública que **reconfigura las expectativas de todos sin tocar una sola
> constante**. Es la aportación más barata y más rentable que el sistema de facciones
> hace al pilar diplomático del juego.

Y funciona en las dos direcciones: traicionar a alguien de tu propia facción no cuesta
más Ceniza, pero **queda registrado como Cisma de mesa** en el historial de partida y
todos lo ven. El castigo es social, que es donde este juego quiere que estén los castigos.

### 4.1 Por qué no tiene efecto mecánico

Se evaluó darle algo (visión compartida inicial, descuento en Sellos entre concordes) y
se rechazó por dos razones:

1. **Rompería el equilibrio de la mesa.** En una partida de 5, dos jugadores con una
   ventaja mutua garantizada son un bloque de facto, y el juego se convierte en 2v3 desde
   el turno 0.
2. **Mataría la tensión que genera.** Lo interesante de la Concordia es la *duda*: ¿se
   van a aliar o no? Si el sistema los alía, no hay duda que resolver.

---

## 5. Renombre

Contador por cuenta y facción de la Ceniza aportada mientras le has jurado.

```
  KOLDVIK              Renombre 1 240 ✦     ·  47 campañas
  Vantera (anterior)   Renombre   310 ✦     ·  12 campañas
```

Sirve para: desbloqueos **puramente cosméticos** de facción (emblemas, paletas,
animaciones) y para dar sentido de pertenencia. **No desbloquea nada mecánico** y no se
pierde al cambiar de facción: queda como historial.

Hitos ⚖️: 250 · 750 · 1 500 · 3 000 ✦.

---

## 6. Cisma: cambiar de facción

Se puede cambiar. Es una decisión con peso, no un menú de ajustes.

| Regla | Valor |
|---|---|
| Coste | **60 ✦** del depósito ⚖️ |
| Espera | **3 campañas completadas** desde el último Cisma |
| Desbloqueos ya obtenidos | **Se conservan todos.** Son de la cuenta, no de la facción. |
| Renombre | Se conserva como historial de la facción anterior |
| Cambia | Identidad, afinidades (y por tanto descuentos futuros) |
| Registro | Público en el perfil: `Vantera → Koldvik` |

Que los desbloqueos se conserven es lo que impide que el Cisma sea una trampa: nadie
pierde progreso por cambiar de idea. Lo que pagas es la Ceniza y la espera.

El primer Cisma es **gratuito y sin espera** dentro de las 3 primeras campañas: un jugador
nuevo eligió facción sin saber lo que elegía, y eso no debe costarle 60 ✦.

---

## 7. Modelo de datos

```ts
type FactionId = 'vantera' | 'koldvik' | 'saranth' | 'meridia' | 'oshara' | 'tarn';

interface Faction {
  id: FactionId;
  originDoctrine: DoctrineId;      // desbloqueada al jurar
  affineDoctrines: DoctrineId[];   // 2, incluye la de origen
  affineAnomalies: AnomalyId[];    // 3
  palette: { primary: string; secondary: string; ink: string };
}

interface AccountFaction {
  factionId: FactionId;
  sworn: number;            // campañas completadas desde el juramento
  renown: number;           // ✦ aportada a esta facción
  schismsUsed: number;
  lastSchismCampaign: number | null;
}
```

Persistencia (v0.6, [TECHNICAL_DESIGN §5](TECHNICAL_DESIGN.md#5-base-de-datos)):

```sql
alter table cities
  add column faction_id  text not null default 'vantera'
    check (faction_id in ('vantera','koldvik','saranth','meridia','oshara','tarn')),
  add column sworn_at    timestamptz not null default now(),
  add column schisms     smallint not null default 0,
  add column last_schism_campaign integer;

create table faction_renown (
  profile_id uuid references profiles on delete cascade,
  faction_id text not null,
  renown     integer not null default 0 check (renown >= 0),
  campaigns  integer not null default 0 check (campaigns >= 0),
  primary key (profile_id, faction_id)
);
alter table faction_renown enable row level security;

create policy "leer mi renombre" on faction_renown for select
  using (profile_id = auth.uid());
-- Sin política de INSERT/UPDATE: solo el servidor escribe con service_role.
```

`game_players.faction_id` se copia **al empezar la partida**, no se lee del perfil: un
Cisma a mitad de campaña no puede cambiar la Concordia ya declarada.

---

## 8. Tests

| Test | Aserción |
|---|---|
| `catalog-integrity` | 6 facciones · cada doctrina es origen de exactamente 1 · cada doctrina afín a exactamente 2 · cada anomalía afín a 2–3 |
| `no-ceiling-difference` | Dos cuentas al máximo de facciones distintas ⇒ conjuntos de opciones **idénticos** |
| `no-balance-import` | `factions/` no importa `balance/` (verificado sobre el AST) |
| `discount-only` | `unlockCost` nunca supera `COSTE_BASE` para ninguna combinación |
| `equal-total-cost` | El coste de desbloquearlo todo es **igual para las 6 facciones** |
| `starting-loadout` | Toda cuenta nueva tiene 1 doctrina + las mismas 3 anomalías |
| `concordance-is-inert` | Una partida con Concordia y otra sin ella producen el **mismo checksum** con las mismas órdenes ← el test que garantiza que no da ventaja |
| `schism-preserves-unlocks` | Tras un Cisma, el conjunto de desbloqueos no cambia |
| `first-schism-free` | El primer Cisma en las 3 primeras campañas no cobra ni espera |

`concordance-is-inert` es el importante: convierte «la Concordia no da ventaja» de
promesa a aserción ejecutable.

---

## 9. Lo que NO tendrán las facciones

| Idea | Por qué no |
|---|---|
| Unidades exclusivas | Rompería la regla de oro y el balance de 6 facciones × 3 armas es inabordable |
| Bonificaciones estadísticas | Rompería la regla de oro |
| Doctrinas exclusivas | Rompería el invariante del techo (§1.1) |
| Guerra de facciones / territorio global persistente | Sistema enorme, ajeno al core loop, y castiga a la facción con menos jugadores |
| Emparejamiento por facción | Reduciría la variedad de mesas |
| Ventaja mecánica por Concordia | Ver §4.1 |
| Ranking de facciones | Empuja al metajuego óptimo, igual que el ELO ([METAPROGRESSION §7](METAPROGRESSION.md#7-lo-que-no-habrá)) |

---

## 10. Plan de implementación

| Versión | Entrega |
|---|---|
| **v0.1** | Catálogo en `packages/core/src/factions/` + reglas de coste y desbloqueo + tests. Sin persistencia. |
| **v0.3** | `faction_id` en `game_players`, copiado al empezar. Concordia declarada en el Parlamento. |
| **v0.6** | Persistencia real: `cities.faction_id`, `faction_renown`, juramento al crear cuenta, Cisma, pantalla de facción en la Ciudad. |
| **v0.9** | Paletas, emblemas y estética por facción. |

Lo primero (v0.1) es el catálogo y **los tests del invariante**, antes que cualquier
interfaz: la restricción se implementa y se verifica antes de que exista nada que pueda
violarla.
