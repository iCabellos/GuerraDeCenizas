/**
 * Tipos del estado de juego.
 *
 * Invariantes que todo el paquete respeta:
 *  - Nada aquí es opcional «por comodidad»: si un campo puede faltar, es porque su
 *    ausencia significa algo.
 *  - Los arrays indexados por id (`control`) se prefieren a los mapas: son canónicos
 *    al serializar y no dependen del orden de inserción.
 *  - Nada de `Set` ni `Map` en el estado: no serializan de forma canónica.
 */

// ─────────────────────────────── Identificadores ───────────────────────────────

export type Seat = 0 | 1 | 2 | 3 | 4;
export type PlayerCount = 2 | 3 | 5;
export type RegionId = number;
export type ForceId = string;

export type FactionId = 'vantera' | 'koldvik' | 'saranth' | 'meridia' | 'oshara' | 'tarn';

export type DoctrineId = 'wedge' | 'anvil' | 'shroud' | 'chorus' | 'ledger' | 'swarm';

export type AnomalyId =
  | 'veil' | 'flare' | 'echo' | 'fold' | 'rift' | 'anchor' | 'exodus' | 'seal';

/**
 * Zona del mapa. Es una **función del anillo** (ADR-041), y de ahí sale que la
 * equidad C_n no cueste nada: la rotación conserva el anillo, luego conserva la zona.
 *
 *   1 · Solar  — uno por jugador, privado. Tu Bastión vive aquí.
 *   2 · Marca  — compartida. Menas ricas y Colosos.
 *   3 · Corona — el Núcleo y el premio final.
 */
export type Zone = 1 | 2 | 3;

/** Materiales que se extraen. La Ceniza NO es uno: no se extrae, y por eso escasea. */
export type MaterialId = 'ore' | 'ember';

export type GateId = number;
export type ColossusId = string;

export type BuildingKind = 'extractor' | 'foundry' | 'arsenal' | 'depot' | 'watch';

export type PolicyId =
  /** Rama económica */
  | 'deepVeins' | 'caravans' | 'recasting'
  /** Rama militar */
  | 'cadence' | 'escalade' | 'marchDoctrine';

/** Nivel de edificio. No hay 0: un edificio de nivel 0 es un edificio que no existe. */
export type Level = 1 | 2 | 3;
/** Grado de tropa. Multiplica lo que se produce DESDE ahora, nunca lo ya desplegado. */
export type Tier = 1 | 2 | 3;
/** Nivel de una Política. 0 = sin investigar. */
export type PolicyRank = 0 | 1 | 2 | 3;

export type ArmId = 'line' | 'fire' | 'sky';

// ────────────────────────────────── Mapa ──────────────────────────────────────

/** Tipos de región. `scoured` (Yerma) llega con Yermo en v0.7. */
export type TerrainKind =
  | 'plain' | 'urban' | 'high' | 'forest' | 'water' | 'seam' | 'bastion' | 'core';

export interface Yield {
  supply: number;
  industry: number;
  intel: number;
  ash: number;
}

export interface Region {
  id: RegionId;
  kind: TerrainKind;
  /** Sector al que pertenece. `-1` solo para el Núcleo. */
  sector: number;
  /** Anillo, 0 = interior. El Núcleo usa `-1`. */
  ring: number;
  /** Posición dentro del anillo, dentro de su sector. */
  slot: number;
  /** Derivada del anillo. Se guarda porque la vista la consulta en cada render. */
  zone: Zone;
  /** Disposición para el render. Determinista, derivada del esqueleto. */
  x: number;
  y: number;
}

export interface Edge {
  a: RegionId;
  b: RegionId;
  /**
   * Cerco: separa dos zonas. **No se cruza.** No es terreno difícil ni cuesta más
   * movimiento: está cerrada, y solo se abre si es una Puerta y su Coloso ha muerto.
   */
  ward?: boolean;
}

/**
 * Puerta: el único punto por el que un Cerco puede abrirse.
 *
 * Una vez abierta **no vuelve a cerrarse nunca**, y no es una simplificación: una
 * Puerta reversible haría que la jugada dominante fuera encerrar al vecino, que es
 * exactamente la eliminación de facto que este juego no tiene.
 */
export interface Gate {
  id: GateId;
  /** Región del lado de la zona mayor (hacia el Núcleo) y del lado exterior. */
  inner: RegionId;
  outer: RegionId;
  /** Zonas que une. Siempre consecutivas: `to === from - 1`. */
  from: Zone;
  to: Zone;
  /** Coloso que la guarda al empezar la partida. */
  colossus: ColossusId;
}

/**
 * Mena: depósito **sobre** un hexágono, distinto de su terreno. Un bosque puede tener
 * una Mena de Brasa: el terreno decide el combate, la Mena decide la economía.
 *
 * Una Mena **no renta por controlarla** — ahí está la diferencia con el Yacimiento
 * (`seam`), que sí. Renta si tienes una Extractora encima, en pie y en suministro.
 */
export interface Vein {
  regionId: RegionId;
  material: MaterialId;
  /** Riqueza. Sube con la zona: Solar 1, Marca 2, Corona 3. */
  grade: 1 | 2 | 3;
}

export interface GameMap {
  regions: Region[];
  /** Siempre normalizadas con `a < b` y ordenadas por `(a, b)`. */
  edges: Edge[];
  coreId: RegionId;
  /** Índice = asiento. */
  bastions: RegionId[];
  /** Ordenadas por id. Índice = `gate.id`. */
  gates: Gate[];
  /** Ordenadas por `regionId`. */
  veins: Vein[];
  /** Radio del lienzo, para el `viewBox` del SVG. */
  extent: number;
}

/** Listas de adyacencia derivadas del mapa. No forman parte del estado. */
export type Adjacency = readonly (readonly RegionId[])[];

// ────────────────────────────────── Fuerzas ───────────────────────────────────

/**
 * `plunder` (Botín) ataca con penalización y, si gana, se lleva parte del almacén de
 * la región, **no la captura** y vuelve a su casilla. Es una decisión declarada de
 * antemano, y por eso se puede prometer y se puede mentir sobre ella.
 */
export type Posture = 'assault' | 'hold' | 'screen' | 'plunder';

export interface Force {
  id: ForceId;
  seat: Seat;
  regionId: RegionId;
  line: number;
  fire: number;
  sky: number;
  posture: Posture;
  /**
   * Turnos consecutivos sin suministro. Cada uno resta un 15 % de potencia.
   * Una fuerza sin suministro no se destruye: se vuelve irrelevante, que es peor y
   * más interesante — sigue ocupando la región y sigue siendo negociable.
   */
  unsupplied: number;
}

export type Arms = Pick<Force, 'line' | 'fire' | 'sky'>;

// ────────────────────────────────── Asientos ──────────────────────────────────

export interface Resources {
  supply: number;
  industry: number;
  intel: number;
  ash: number;
  /** Mineral. Edificios, fortificación y grado de Línea. */
  ore: number;
  /** Brasa. Políticas, grados de Fuego y Cielo, Extractoras de nivel 3. */
  ember: number;
}

/** Lo que guarda una región. Vive AHÍ y no en el asiento: por eso se puede robar. */
export interface MaterialStock {
  ore: number;
  ember: number;
}

export interface SeatState {
  seat: Seat;
  name: string;
  factionId: FactionId;
  doctrineId: DoctrineId;
  anomalies: AnomalyId[];
  resources: Resources;
  /**
   * Grado por arma. Empieza en 1 para TODOS — cuenta nueva y cuenta veterana
   * ([ADR-045](../../../docs/DECISIONS.md)). Lo que la cuenta guarda entre campañas es
   * qué puedes llevar, no en qué nivel lo dejaste.
   */
  tiers: Record<ArmId, Tier>;
  /** Nivel investigado de cada Política. Permanente **dentro de la campaña**. */
  policies: Record<PolicyId, PolicyRank>;
}

/**
 * Edificio. Se captura con la región (un nivel menos), no se destruye: así atacar una
 * Extractora de nivel 3 es mejor que construirse la propia, y el mapa se pelea.
 */
export interface Building {
  regionId: RegionId;
  kind: BuildingKind;
  level: Level;
  /** Turnos que faltan para terminar la obra en curso. 0 = operativo. */
  building: number;
  /**
   * Nivel al que se llegará cuando termine la obra. Igual a `level` si no hay obra.
   * Durante la obra el edificio **no produce**: mejorar es renunciar a renta ahora.
   */
  target: Level;
}

/**
 * Coloso: fuerza neutral que ocupa la región interior de una Puerta y **no se mueve
 * nunca**. Mientras vive, la Puerta está sellada. Muerto, la abre **para todos**.
 *
 * Va en su propio array y NO reutiliza `Force` a propósito: hacer `Force.seat`
 * anulable obligaría a revisar cada desempate por asiento del paquete.
 */
export interface Colossus {
  id: ColossusId;
  gateId: GateId;
  regionId: RegionId;
  line: number;
  fire: number;
  sky: number;
  /** Potencia inicial, para la regeneración y para el Despojo. */
  peak: number;
  alive: boolean;
}

// ──────────────────────────────────── Estado ──────────────────────────────────

export type Phase = 'parley' | 'war' | 'resolved';

export interface GameMeta {
  gameId: string;
  engineVersion: string;
  mapgenVersion: string;
  seed: number;
  turn: number;
  phase: Phase;
  playerCount: PlayerCount;
}

export interface GameState {
  meta: GameMeta;
  map: GameMap;
  seats: SeatState[];
  forces: Force[];
  /**
   * Índice = `regionId`. `null` = neutral o disputada.
   * El control territorial es **público** (ver GDD §6.2): lo que se oculta es la
   * composición militar, no quién tiene qué.
   */
  control: (Seat | null)[];
  /** Índice = `regionId`. Nivel de fortificación, 0–2. Se hereda al capturar. */
  fortification: number[];
  /** Índice = `regionId`. Un puente permite a Línea y Fuego cruzar una región de agua. */
  bridges: boolean[];
  /** Ordenados por `(regionId, kind)`. Un edificio por tipo y región. */
  buildings: Building[];
  /** Índice = `regionId`. Lo que la región guarda sin llevar todavía al asiento. */
  stock: MaterialStock[];
  /** Ordenados por id. */
  colossi: Colossus[];
  /** Índice = `gate.id`. Una Puerta abierta nunca vuelve a cerrarse. */
  gatesOpen: boolean[];
  /** Posición del PRNG. Forma parte del estado o la partida no sería reproducible. */
  rngCursor: number;
}

// ──────────────────────────────────── Órdenes ─────────────────────────────────

export interface MoveOrder {
  forceId: ForceId;
  /** Ausente = la fuerza se queda donde está. */
  to?: RegionId;
  /** Ausente = se mueve la fuerza entera. */
  detach?: Arms;
  posture: Posture;
  /**
   * Región adyacente a la que esta fuerza presta su Fuego (GDD §7.5). Solo con
   * postura Firme y sin moverse. El apoyo no recibe bajas: es la ayuda militar más
   * barata del juego, y por eso prometerla y no darla es una jugada.
   */
  fireSupport?: RegionId;
}

export type Buildable = 'line' | 'fire' | 'sky' | 'fort' | 'bridge';

export interface ProductionOrder {
  regionId: RegionId;
  item: Buildable;
  qty: number;
}

/**
 * Obra: construir o subir un nivel. **Una por región y turno** — no hay colas, porque
 * una cola es una decisión que tomas una vez y el juego ejecuta sin ti.
 */
export interface WorkOrder {
  regionId: RegionId;
  kind: BuildingKind;
}

/**
 * Investigación. Sube un grado de arma o un nivel de Política, y consume **el turno de
 * la Fundición**: investigar y construir compiten por el mismo edificio.
 */
export type ResearchOrder =
  | { kind: 'tier'; arm: ArmId }
  | { kind: 'policy'; policy: PolicyId };

export interface Orders {
  turn: number;
  moves: MoveOrder[];
  /** Ausente = no se produce nada este turno. */
  production?: ProductionOrder[];
  /** Ausente = ninguna obra. */
  works?: WorkOrder[];
  /** Ausente = no se investiga. Como mucho una por turno y asiento. */
  research?: ResearchOrder;
}

export type OrdersBySeat = Partial<Record<Seat, Orders>>;

// ──────────────────────────────────── Eventos ─────────────────────────────────

export type EventType =
  | 'ORDER_REJECTED'
  | 'FORCE_MOVED'
  | 'FORCE_BLOCKED'
  | 'FORCE_MERGED'
  | 'FORCE_DESTROYED'
  | 'FORCE_RETREATED'
  | 'COMBAT'
  | 'REGION_CAPTURED'
  | 'REGION_CONTESTED'
  | 'REGION_FORTIFIED'
  | 'BRIDGE_BUILT'
  | 'PRODUCED'
  | 'INCOME'
  | 'SUPPLY_FAILED'
  | 'CONCORDANCE'
  | 'COLOSSUS_FOUGHT'
  | 'COLOSSUS_SLAIN'
  | 'GATE_OPENED'
  | 'SPOILS_TAKEN'
  | 'PLUNDERED'
  | 'EXTRACTED'
  | 'HAULED'
  | 'WORK_STARTED'
  | 'WORK_FINISHED'
  | 'BUILDING_CAPTURED'
  | 'TIER_RAISED'
  | 'POLICY_ADOPTED'
  | 'ACT_CHANGED'
  | 'TURN_CLOSED';

export interface GameEvent {
  seq: number;
  turn: number;
  type: EventType;
  /** Asiento que provoca el evento; `null` si es del sistema. */
  seat: Seat | null;
  /** Asientos que pueden verlo. Ya filtrado: el cliente no filtra nada. */
  visibleTo: Seat[];
  data: Readonly<Record<string, string | number | boolean | null>>;
}

// ───────────────────────────────── Vista de jugador ───────────────────────────

/** Fuerza tal como la ve un asiento. Las ajenas pueden venir sin desglose de armas. */
export interface VisibleForce {
  id: ForceId;
  seat: Seat;
  regionId: RegionId;
  /** `true` si es propia: entonces `line`/`fire`/`sky` son exactos. */
  own: boolean;
  line: number | null;
  fire: number | null;
  sky: number | null;
  /** Tamaño total aproximado cuando no se conoce el desglose. */
  approxTotal: number | null;
  posture: Posture | null;
  /** Turnos sin suministro. Solo se conoce de las fuerzas propias. */
  unsupplied: number | null;
}

export interface OpponentView {
  seat: Seat;
  name: string;
  factionId: FactionId;
  doctrineId: DoctrineId;
  /** `true` si comparte facción contigo. Informativo: no tiene efecto mecánico. */
  concordant: boolean;
}

/** Edificio tal como lo ve un asiento. Solo llegan los propios y los observados. */
export interface VisibleBuilding {
  regionId: RegionId;
  kind: BuildingKind;
  level: Level;
  building: number;
  target: Level;
  own: boolean;
}

/** Almacén de una región observada. Lo que no se observa no viaja. */
export interface VisibleStock {
  regionId: RegionId;
  ore: number;
  ember: number;
}

export interface PlayerView {
  seat: Seat;
  turn: number;
  phase: Phase;
  /** Acto en curso, derivado del turno. Cambia con las zonas, no con el calendario. */
  act: Zone;
  map: GameMap;
  /** Regiones observadas este turno. Ordenadas. */
  visible: RegionId[];
  control: (Seat | null)[];
  fortification: number[];
  bridges: boolean[];
  forces: VisibleForce[];
  /**
   * Puertas abiertas. **Público**: quién pagó la Puerta y cuándo lo ven los cinco, y
   * es justo lo que convierte el pago en una carta de negociación.
   */
  gatesOpen: boolean[];
  /**
   * Colosos, con su potencia exacta. **Públicos a propósito**: un Coloso previsible es
   * un Coloso sobre el que se puede prometer ayuda y comprobar si la diste.
   */
  colossi: Colossus[];
  buildings: VisibleBuilding[];
  stock: VisibleStock[];
  self: SeatState;
  opponents: OpponentView[];
  events: GameEvent[];
  checksum: string;
}

// ─────────────────────────────── Resolución ───────────────────────────────────

export interface ResolveContext {
  engineVersion: string;
  /** Inyectado por quien llama. El motor nunca lee el reloj. */
  now: number;
}

export interface ResolveResult {
  state: GameState;
  events: GameEvent[];
  views: Record<Seat, PlayerView>;
  checksum: string;
}
