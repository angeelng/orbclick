import type { PostId } from './posts';
import type { SpeciesId } from './species';
import type { ZoneId } from './zones';

/**
 * Logros del MVP (GDD · Progresión, tienda, logros y offline): veintiocho
 * metas que cada una suma un +1 % de producción global permanente. El número
 * del bonus vive en `data/balance.ts`; aquí solo está el contenido.
 *
 * Los requisitos son **declarativos**: una unión de formas que describe qué
 * hay que cumplir, sin una línea de lógica. Quien los evalúa es
 * `core/achievements.ts`, que es donde puede haber reglas.
 */

/** Contadores de la partida que un logro puede mirar. */
export type AchievementStat =
  'totalClicks' | 'totalCoinsEarned' | 'totalCaptures' | 'totalOrbsThrown' | 'totalDefeats';

export type AchievementRequirement =
  /** Un contador de `stats` llega a `amount`. */
  | { readonly kind: 'stat'; readonly stat: AchievementStat; readonly amount: number }
  /** El entrenador alcanza un nivel. */
  | { readonly kind: 'level'; readonly level: number }
  /** El jefe de una zona está vencido. */
  | { readonly kind: 'boss'; readonly zoneId: ZoneId }
  /** Hay en la colección al menos un ejemplar de cada especie de la lista. */
  | { readonly kind: 'species'; readonly speciesIds: readonly SpeciesId[] }
  /** Hay alguna variocolor en la colección. */
  | { readonly kind: 'shiny' }
  /** Alguna criatura llega al nivel `level`. */
  | { readonly kind: 'creatureLevel'; readonly level: number }
  /** Todos estos puestos tienen a alguien trabajando a la vez. */
  | { readonly kind: 'postsStaffed'; readonly postIds: readonly PostId[] }
  /** Hay `count` sinergias de tipo activas en el Rancho. */
  | { readonly kind: 'synergies'; readonly count: number }
  /** El Rancho tiene al menos `slots` plazas. */
  | { readonly kind: 'ranchSlots'; readonly slots: number }
  /** Se guardan `amount` bayas en la despensa. */
  | { readonly kind: 'berries'; readonly amount: number };

/** Grupos con los que la interfaz ordena la lista. */
export const ACHIEVEMENT_GROUPS = ['click', 'capture', 'ranch', 'combat', 'progress'] as const;

export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

export interface AchievementDefinition {
  readonly id: AchievementId;
  readonly name: string;
  /** Qué hay que hacer, en una línea y en segunda persona. */
  readonly description: string;
  readonly group: AchievementGroup;
  readonly requirement: AchievementRequirement;
}

export const ACHIEVEMENT_IDS = [
  'first-click',
  'clicks-100',
  'clicks-1000',
  'clicks-10000',
  'coins-1000',
  'coins-100k',
  'coins-10m',
  'first-capture',
  'captures-10',
  'captures-50',
  'orbs-50',
  'defeats-25',
  'first-shiny',
  'roster-meadow',
  'roster-cave',
  'roster-lake',
  'roster-full',
  'boss-meadow',
  'boss-cave',
  'boss-lake',
  'level-5',
  'level-10',
  'level-15',
  'ranch-slots-8',
  'posts-all',
  'creature-level-10',
  'synergies-all',
  'berries-100',
] as const;

export type AchievementId = (typeof ACHIEVEMENT_IDS)[number];

/** Las cuatro capturables de cada zona, que es lo que pide el logro de roster. */
const MEADOW_ROSTER: readonly SpeciesId[] = ['brotillo', 'pelusin', 'ascuin', 'chispin'];
const CAVE_ROSTER: readonly SpeciesId[] = ['pedrusco', 'musgolito', 'brasacol', 'cuarzin'];
const LAKE_ROSTER: readonly SpeciesId[] = ['goton', 'ranaflor', 'anguilux', 'nenufrel'];

export const ACHIEVEMENTS: Readonly<Record<AchievementId, AchievementDefinition>> = {
  'first-click': {
    id: 'first-click',
    name: 'El primer golpe',
    description: 'Clica el objeto de la zona una vez.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalClicks', amount: 1 },
  },
  'clicks-100': {
    id: 'clicks-100',
    name: 'Mano suelta',
    description: 'Da 100 clics.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalClicks', amount: 100 },
  },
  'clicks-1000': {
    id: 'clicks-1000',
    name: 'Dedo de hierro',
    description: 'Da 1.000 clics.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalClicks', amount: 1_000 },
  },
  'clicks-10000': {
    id: 'clicks-10000',
    name: 'Leyenda del clic',
    description: 'Da 10.000 clics.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalClicks', amount: 10_000 },
  },
  'coins-1000': {
    id: 'coins-1000',
    name: 'Primer saco',
    description: 'Gana 1.000 monedas en total.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalCoinsEarned', amount: 1_000 },
  },
  'coins-100k': {
    id: 'coins-100k',
    name: 'Buen negocio',
    description: 'Gana 100.000 monedas en total.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalCoinsEarned', amount: 100_000 },
  },
  'coins-10m': {
    id: 'coins-10m',
    name: 'Fortuna del valle',
    description: 'Gana 10.000.000 de monedas en total.',
    group: 'click',
    requirement: { kind: 'stat', stat: 'totalCoinsEarned', amount: 10_000_000 },
  },
  'first-capture': {
    id: 'first-capture',
    name: 'Una compañera',
    description: 'Captura tu primera criatura.',
    group: 'capture',
    requirement: { kind: 'stat', stat: 'totalCaptures', amount: 1 },
  },
  'captures-10': {
    id: 'captures-10',
    name: 'Rancho con vida',
    description: 'Captura 10 criaturas.',
    group: 'capture',
    requirement: { kind: 'stat', stat: 'totalCaptures', amount: 10 },
  },
  'captures-50': {
    id: 'captures-50',
    name: 'Coleccionista',
    description: 'Captura 50 criaturas.',
    group: 'capture',
    requirement: { kind: 'stat', stat: 'totalCaptures', amount: 50 },
  },
  'orbs-50': {
    id: 'orbs-50',
    name: 'Buen brazo',
    description: 'Lanza 50 orbes.',
    group: 'capture',
    requirement: { kind: 'stat', stat: 'totalOrbsThrown', amount: 50 },
  },
  'defeats-25': {
    id: 'defeats-25',
    name: 'Sin piedad',
    description: 'Derrota a 25 salvajes a clics.',
    group: 'combat',
    requirement: { kind: 'stat', stat: 'totalDefeats', amount: 25 },
  },
  'first-shiny': {
    id: 'first-shiny',
    name: 'Color raro',
    description: 'Captura tu primera criatura variocolor.',
    group: 'capture',
    requirement: { kind: 'shiny' },
  },
  'roster-meadow': {
    id: 'roster-meadow',
    name: 'Censo de la Pradera',
    description: 'Captura las cuatro criaturas de la Pradera.',
    group: 'capture',
    requirement: { kind: 'species', speciesIds: MEADOW_ROSTER },
  },
  'roster-cave': {
    id: 'roster-cave',
    name: 'Censo de la Cueva',
    description: 'Captura las cuatro criaturas de la Cueva.',
    group: 'capture',
    requirement: { kind: 'species', speciesIds: CAVE_ROSTER },
  },
  'roster-lake': {
    id: 'roster-lake',
    name: 'Censo del Lago',
    description: 'Captura las cuatro criaturas del Lago.',
    group: 'capture',
    requirement: { kind: 'species', speciesIds: LAKE_ROSTER },
  },
  'roster-full': {
    id: 'roster-full',
    name: 'Las doce',
    description: 'Captura las doce criaturas capturables del MVP.',
    group: 'capture',
    requirement: {
      kind: 'species',
      speciesIds: [...MEADOW_ROSTER, ...CAVE_ROSTER, ...LAKE_ROSTER],
    },
  },
  'boss-meadow': {
    id: 'boss-meadow',
    name: 'Cornavid vencido',
    description: 'Vence al jefe de la Pradera.',
    group: 'combat',
    requirement: { kind: 'boss', zoneId: 'meadow' },
  },
  'boss-cave': {
    id: 'boss-cave',
    name: 'Geodrón vencido',
    description: 'Vence al jefe de la Cueva.',
    group: 'combat',
    requirement: { kind: 'boss', zoneId: 'cave' },
  },
  'boss-lake': {
    id: 'boss-lake',
    name: 'Marealis vencido',
    description: 'Vence al jefe del Lago.',
    group: 'combat',
    requirement: { kind: 'boss', zoneId: 'lake' },
  },
  'level-5': {
    id: 'level-5',
    name: 'Entrenador de barrio',
    description: 'Llega al nivel 5.',
    group: 'progress',
    requirement: { kind: 'level', level: 5 },
  },
  'level-10': {
    id: 'level-10',
    name: 'Entrenador curtido',
    description: 'Llega al nivel 10.',
    group: 'progress',
    requirement: { kind: 'level', level: 10 },
  },
  'level-15': {
    id: 'level-15',
    name: 'Techo del valle',
    description: 'Llega al nivel 15.',
    group: 'progress',
    requirement: { kind: 'level', level: 15 },
  },
  'ranch-slots-8': {
    id: 'ranch-slots-8',
    name: 'Rancho grande',
    description: 'Ten 8 plazas de Rancho.',
    group: 'ranch',
    requirement: { kind: 'ranchSlots', slots: 8 },
  },
  'posts-all': {
    id: 'posts-all',
    name: 'Todo el mundo a lo suyo',
    description: 'Ten a alguien trabajando en los seis puestos a la vez.',
    group: 'ranch',
    requirement: {
      kind: 'postsStaffed',
      postIds: ['gather', 'farm', 'mine', 'craft', 'explore', 'care'],
    },
  },
  'creature-level-10': {
    id: 'creature-level-10',
    name: 'Maestra del Rancho',
    description: 'Sube una criatura al nivel 10.',
    group: 'ranch',
    requirement: { kind: 'creatureLevel', level: 10 },
  },
  'synergies-all': {
    id: 'synergies-all',
    name: 'Buena compañía',
    description: 'Activa las tres sinergias de tipo a la vez.',
    group: 'ranch',
    requirement: { kind: 'synergies', count: 3 },
  },
  'berries-100': {
    id: 'berries-100',
    name: 'Despensa llena',
    description: 'Guarda 100 bayas.',
    group: 'ranch',
    requirement: { kind: 'berries', amount: 100 },
  },
};

export const ACHIEVEMENT_LIST: readonly AchievementDefinition[] = ACHIEVEMENT_IDS.map(
  (id) => ACHIEVEMENTS[id],
);

export function getAchievement(id: AchievementId): AchievementDefinition {
  return ACHIEVEMENTS[id];
}

export function isAchievementId(value: unknown): value is AchievementId {
  return typeof value === 'string' && (ACHIEVEMENT_IDS as readonly string[]).includes(value);
}

/** Logros de un grupo, en el orden en que están declarados. */
export function achievementsOfGroup(group: AchievementGroup): readonly AchievementDefinition[] {
  return ACHIEVEMENT_LIST.filter((achievement) => achievement.group === group);
}
