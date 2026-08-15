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
  /** Disposición para el render. Determinista, derivada del esqueleto. */
  x: number;
  y: number;
}

export interface Edge {
  a: RegionId;
  b: RegionId;
}

export interface GameMap {
  regions: Region[];
  /** Siempre normalizadas con `a < b` y ordenadas por `(a, b)`. */
  edges: Edge[];
  coreId: RegionId;
  /** Índice = asiento. */
  bastions: RegionId[];
  /** Radio del lienzo, para el `viewBox` del SVG. */
  extent: number;
}

/** Listas de adyacencia derivadas del mapa. No forman parte del estado. */
export type Adjacency = readonly (readonly RegionId[])[];

// ────────────────────────────────── Fuerzas ───────────────────────────────────

export type Posture = 'assault' | 'hold' | 'screen';

export interface Force {
  id: ForceId;
  seat: Seat;
  regionId: RegionId;
  line: number;
  fire: number;
  sky: number;
  posture: Posture;
}

export type Arms = Pick<Force, 'line' | 'fire' | 'sky'>;

// ────────────────────────────────── Asientos ──────────────────────────────────

export interface Resources {
  supply: number;
  industry: number;
  intel: number;
  ash: number;
}

export interface SeatState {
  seat: Seat;
  name: string;
  factionId: FactionId;
  doctrineId: DoctrineId;
  anomalies: AnomalyId[];
  resources: Resources;
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
}

export interface Orders {
  turn: number;
  moves: MoveOrder[];
}

export type OrdersBySeat = Partial<Record<Seat, Orders>>;

// ──────────────────────────────────── Eventos ─────────────────────────────────

export type EventType =
  | 'ORDER_REJECTED'
  | 'FORCE_MOVED'
  | 'FORCE_BLOCKED'
  | 'FORCE_MERGED'
  | 'REGION_CAPTURED'
  | 'REGION_CONTESTED'
  | 'CONCORDANCE'
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
}

export interface OpponentView {
  seat: Seat;
  name: string;
  factionId: FactionId;
  doctrineId: DoctrineId;
  /** `true` si comparte facción contigo. Informativo: no tiene efecto mecánico. */
  concordant: boolean;
}

export interface PlayerView {
  seat: Seat;
  turn: number;
  phase: Phase;
  map: GameMap;
  /** Regiones observadas este turno. Ordenadas. */
  visible: RegionId[];
  control: (Seat | null)[];
  forces: VisibleForce[];
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
