import type { AchievementId } from '../data/achievements';
import { BALANCE } from '../data/balance';
import type { UpgradeId } from '../data/items';
import type { OrbId } from '../data/orbs';
import type { PostId } from '../data/posts';
import type { SpeciesId } from '../data/species';
import type { TraitId } from '../data/traits';
import { STARTING_ZONE_ID, type ZoneId } from '../data/zones';

export interface TrainerState {
  readonly level: number;
  /** XP acumulada dentro del nivel actual. */
  readonly xp: number;
}

export interface GameStats {
  readonly totalClicks: number;
  readonly totalCoinsEarned: number;
  readonly totalCaptures: number;
  readonly totalOrbsThrown: number;
  /** Salvajes derrotadas a clics (se pierden, pero pagan monedas). */
  readonly totalDefeats: number;
}

/** Niveles de mejora comprados en cada puesto del Rancho. */
export type PostUpgrades = Readonly<Partial<Record<PostId, number>>>;

/** Cuántas unidades de cada mejora ha comprado el jugador. */
export type UpgradeCounts = Readonly<Partial<Record<UpgradeId, number>>>;

/** Orbes en la mochila. */
export type OrbCounts = Readonly<Partial<Record<OrbId, number>>>;

/** Dónde está un ejemplar: trabajando en el Rancho o guardado en la Reserva. */
export type CreatureLocation = 'ranch' | 'reserve';

/** Ficha de un ejemplar capturado (GDD · Criaturas). */
export interface CapturedCreature {
  /** Identificador dentro de la partida; se reparte con un contador. */
  readonly uid: number;
  readonly speciesId: SpeciesId;
  readonly level: number;
  readonly xp: number;
  readonly traitId: TraitId;
  readonly shiny: boolean;
  /** Saciedad 0–100; baja un punto por minuto mientras trabaja. */
  readonly satiety: number;
  readonly location: CreatureLocation;
  /** Hasta cuándo está agotada tras caer en combate: ni trabaja ni pelea. */
  readonly exhaustedUntil: number;
  /** Puesto del Rancho en el que trabaja, o `null` si está sin asignar. */
  readonly postId: PostId | null;
  readonly capturedAt: number;
}

/** Una criatura dentro de un combate. */
export interface Battler {
  readonly uid: number;
  readonly speciesId: SpeciesId;
  readonly hp: number;
  readonly maxHp: number;
  /** Cuándo le toca el siguiente golpe automático. */
  readonly nextAttackAt: number;
  /** Carga de su habilidad activa, de 0 a 1. */
  readonly charge: number;
  readonly shieldUntil: number;
}

/** Contra qué se pelea: la salvaje de la zona o el jefe, con su mecánica. */
export type BattleKind = 'wild' | 'boss';

/** Combate en curso contra la salvaje de la zona o contra su jefe. */
export interface BattleState {
  readonly kind: BattleKind;
  readonly enemySpeciesId: SpeciesId;
  readonly enemyShiny: boolean;
  readonly enemyHp: number;
  readonly enemyMaxHp: number;
  readonly enemyAtk: number;
  readonly enemyDef: number;
  readonly enemyNextAttackAt: number;
  readonly enemyAsleepUntil: number;
  /** Clics que aún aguanta el escudo de piedra de Geodrón; 0 si no hay escudo. */
  readonly enemyShieldHits: number;
  /** Cuándo vuelve a dispararse la mecánica del jefe; 0 si el rival no es jefe. */
  readonly mechanicAt: number;
  readonly team: readonly Battler[];
  readonly berriesUsed: number;
  readonly startedAt: number;
  readonly lastTickAt: number;
  readonly endsAt: number;
}

/**
 * Progreso con el jefe de una zona (GDD · Jefes de zona). Vencerlo abre la
 * zona siguiente y deja capturarlo; después se puede volver a retar cuando
 * pase el enfriamiento.
 */
export interface BossProgress {
  readonly defeated: boolean;
  /** Antes de esta hora el jefe no se deja retar otra vez. */
  readonly availableAt: number;
}

/** Salvaje presente ahora mismo en la zona activa. */
export interface WildEncounter {
  readonly speciesId: SpeciesId;
  readonly hp: number;
  readonly maxHp: number;
  readonly shiny: boolean;
  readonly appearedAt: number;
  /** Si no la atiendes antes de esta hora, huye. */
  readonly fleesAt: number;
}

/**
 * Partida completa. Guarda solo IDs y progreso: nunca copias de las
 * definiciones de `data/`.
 */
export interface GameState {
  readonly createdAt: number;
  /** Última vez que el estado avanzó; base del progreso offline (fase 4). */
  readonly lastSeenAt: number;
  readonly coins: number;
  readonly trainer: TrainerState;
  readonly stats: GameStats;
  readonly upgrades: UpgradeCounts;
  readonly orbs: OrbCounts;
  readonly berries: number;
  /** Plazas de Rancho compradas por encima de las iniciales. */
  readonly extraRanchSlots: number;
  readonly postUpgrades: PostUpgrades;
  /** Orbe a medio fabricar en el Taller; evita perder la producción parcial. */
  readonly orbProgress: number;
  readonly creatures: readonly CapturedCreature[];
  readonly nextCreatureUid: number;
  readonly encounter: WildEncounter | null;
  readonly nextSpawnAt: number;
  /** Equipo de combate, por uid y en orden (GDD: hasta 3). */
  readonly team: readonly number[];
  readonly battle: BattleState | null;
  readonly activeZoneId: ZoneId;
  readonly unlockedZoneIds: readonly ZoneId[];
  /** Jefes vencidos y su enfriamiento, por zona. */
  readonly bosses: Readonly<Partial<Record<ZoneId, BossProgress>>>;
  /** Logros conseguidos; cada uno suma un +1 % de producción global (GDD). */
  readonly achievements: readonly AchievementId[];
  /** Semilla del PRNG, para que la secuencia sobreviva al guardado. */
  readonly rngSeed: number;
}

export function createInitialState(now: number, seed: number): GameState {
  return {
    createdAt: now,
    lastSeenAt: now,
    coins: 0,
    trainer: { level: 1, xp: 0 },
    stats: {
      totalClicks: 0,
      totalCoinsEarned: 0,
      totalCaptures: 0,
      totalOrbsThrown: 0,
      totalDefeats: 0,
    },
    upgrades: {},
    orbs: {},
    berries: 0,
    extraRanchSlots: 0,
    postUpgrades: {},
    orbProgress: 0,
    creatures: [],
    nextCreatureUid: 1,
    encounter: null,
    nextSpawnAt: now + BALANCE.capture.spawnMinMs,
    team: [],
    battle: null,
    activeZoneId: STARTING_ZONE_ID,
    unlockedZoneIds: [STARTING_ZONE_ID],
    bosses: {},
    achievements: [],
    rngSeed: seed >>> 0,
  };
}
