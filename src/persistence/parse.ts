import {
  createInitialState,
  type BossProgress,
  type CapturedCreature,
  type PostUpgrades,
  type CreatureLocation,
  type GameState,
  type OrbCounts,
  type UpgradeCounts,
  type WildEncounter,
} from '../core/state';
import { isAchievementId, type AchievementId } from '../data/achievements';
import { BALANCE } from '../data/balance';
import { isUpgradeId } from '../data/items';
import { isOrbId } from '../data/orbs';
import { isPostId } from '../data/posts';
import { isSpeciesId } from '../data/species';
import { isTraitId } from '../data/traits';
import { STARTING_ZONE_ID, isZoneId } from '../data/zones';
import { migrate } from './migrations';
import { SAVE_VERSION, type SaveFile } from './types';

/**
 * Lee una partida desconocida (localStorage, portapapeles) y la convierte en un
 * `SaveFile` válido. Un campo corrupto cae a su valor inicial en vez de romper
 * la partida entera.
 */
export class SaveParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SaveParseError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown, fallback: number): number {
  const parsed = num(value, fallback);
  return parsed < 0 ? fallback : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Jefes vencidos y sus enfriamientos. Un enfriamiento con fecha imposible
 * (partida editada a mano, reloj movido) se recorta a `now`: como mucho se
 * pierde un enfriamiento, nunca se bloquea un jefe para siempre.
 */
function parseBosses(raw: unknown, now: number): GameState['bosses'] {
  if (!isRecord(raw)) return {};
  const bosses: Record<string, BossProgress> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isZoneId(id) || !isRecord(value)) continue;
    bosses[id] = {
      defeated: value['defeated'] === true,
      availableAt: Math.min(
        now + BALANCE.combat.boss.retryCooldownMs,
        nonNegative(value['availableAt'], 0),
      ),
    };
  }
  return bosses;
}

/** Solo entran logros conocidos y sin repetir; lo demás se descarta. */
function parseAchievements(raw: unknown): readonly AchievementId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isAchievementId))];
}

/** Se queda solo con las mejoras conocidas y con cantidades enteras positivas. */
function parseUpgrades(raw: unknown): UpgradeCounts {
  if (!isRecord(raw)) return {};
  const upgrades: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isUpgradeId(id)) continue;
    const count = Math.floor(nonNegative(value, 0));
    if (count > 0) upgrades[id] = count;
  }
  return upgrades;
}

function parseOrbs(raw: unknown): OrbCounts {
  if (!isRecord(raw)) return {};
  const orbs: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isOrbId(id)) continue;
    const count = Math.floor(nonNegative(value, 0));
    if (count > 0) orbs[id] = count;
  }
  return orbs;
}

/** Solo entran al equipo uids que existen, sin repetir y dentro del tope. */
function parseTeam(raw: unknown, creatures: readonly CapturedCreature[]): readonly number[] {
  if (!Array.isArray(raw)) return [];
  const known = new Set(creatures.map((creature) => creature.uid));
  const team: number[] = [];
  for (const value of raw) {
    const uid = Math.floor(num(value, 0));
    if (!known.has(uid) || team.includes(uid)) continue;
    if (team.length >= BALANCE.combat.maxTeamSize) break;
    team.push(uid);
  }
  return team;
}

function parseLocation(value: unknown): CreatureLocation {
  return value === 'reserve' ? 'reserve' : 'ranch';
}

/** Niveles de mejora de puesto, recortados al máximo permitido. */
function parsePostUpgrades(raw: unknown): PostUpgrades {
  if (!isRecord(raw)) return {};
  const upgrades: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (!isPostId(id)) continue;
    const level = Math.min(BALANCE.ranch.maxPostUpgrades, Math.floor(nonNegative(value, 0)));
    if (level > 0) upgrades[id] = level;
  }
  return upgrades;
}

/** Descarta los ejemplares de especies desconocidas y reasigna los uid repetidos. */
function parseCreatures(raw: unknown, now: number): readonly CapturedCreature[] {
  if (!Array.isArray(raw)) return [];
  const creatures: CapturedCreature[] = [];
  const seenUids = new Set<number>();

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const speciesId = entry['speciesId'];
    if (!isSpeciesId(speciesId)) continue;

    let uid = Math.floor(num(entry['uid'], 0));
    if (uid < 1 || seenUids.has(uid)) uid = (creatures.length > 0 ? Math.max(...seenUids) : 0) + 1;
    seenUids.add(uid);

    const traitId = entry['traitId'];
    creatures.push({
      uid,
      speciesId,
      level: Math.max(1, Math.floor(nonNegative(entry['level'], 1))),
      xp: nonNegative(entry['xp'], 0),
      traitId: isTraitId(traitId) ? traitId : 'hardworking',
      shiny: entry['shiny'] === true,
      satiety: clamp(num(entry['satiety'], 100), 0, 100),
      location: parseLocation(entry['location']),
      postId: isPostId(entry['postId']) ? entry['postId'] : null,
      exhaustedUntil: nonNegative(entry['exhaustedUntil'], 0),
      capturedAt: num(entry['capturedAt'], now),
    });
  }
  return creatures;
}

/** Una aparición a medias no se restaura: la siguiente llegará sola. */
function parseEncounter(raw: unknown, now: number): WildEncounter | null {
  if (!isRecord(raw)) return null;
  const speciesId = raw['speciesId'];
  if (!isSpeciesId(speciesId)) return null;

  const fleesAt = num(raw['fleesAt'], 0);
  if (fleesAt <= now) return null;

  const maxHp = Math.max(1, Math.round(nonNegative(raw['maxHp'], 1)));
  return {
    speciesId,
    maxHp,
    hp: clamp(Math.round(nonNegative(raw['hp'], maxHp)), 0, maxHp),
    shiny: raw['shiny'] === true,
    appearedAt: num(raw['appearedAt'], now),
    fleesAt,
  };
}

function parseState(raw: unknown, fallback: GameState, now: number): GameState {
  if (!isRecord(raw)) return fallback;

  const trainerRaw = isRecord(raw['trainer']) ? raw['trainer'] : {};
  const statsRaw = isRecord(raw['stats']) ? raw['stats'] : {};
  const unlockedRaw = Array.isArray(raw['unlockedZoneIds']) ? raw['unlockedZoneIds'] : [];
  // Sin repetidas: la lista es un conjunto, y duplicarla despistaría al juego.
  const unlocked = [...new Set(unlockedRaw.filter(isZoneId))];
  const creatures = parseCreatures(raw['creatures'], now);
  const nextUid = Math.floor(nonNegative(raw['nextCreatureUid'], 1));
  const highestUid = creatures.reduce((max, creature) => Math.max(max, creature.uid), 0);

  return {
    createdAt: num(raw['createdAt'], fallback.createdAt),
    lastSeenAt: num(raw['lastSeenAt'], fallback.lastSeenAt),
    coins: nonNegative(raw['coins'], fallback.coins),
    trainer: {
      level: Math.max(1, Math.floor(nonNegative(trainerRaw['level'], 1))),
      xp: nonNegative(trainerRaw['xp'], 0),
    },
    stats: {
      totalClicks: Math.floor(nonNegative(statsRaw['totalClicks'], 0)),
      totalCoinsEarned: nonNegative(statsRaw['totalCoinsEarned'], 0),
      totalCaptures: Math.floor(nonNegative(statsRaw['totalCaptures'], 0)),
      totalOrbsThrown: Math.floor(nonNegative(statsRaw['totalOrbsThrown'], 0)),
      totalDefeats: Math.floor(nonNegative(statsRaw['totalDefeats'], 0)),
    },
    upgrades: parseUpgrades(raw['upgrades']),
    orbs: parseOrbs(raw['orbs']),
    berries: nonNegative(raw['berries'], 0),
    extraRanchSlots: Math.min(
      BALANCE.ranch.maxSlots - BALANCE.ranch.startingSlots,
      Math.floor(nonNegative(raw['extraRanchSlots'], 0)),
    ),
    postUpgrades: parsePostUpgrades(raw['postUpgrades']),
    orbProgress: clamp(num(raw['orbProgress'], 0), 0, 1),
    creatures,
    // El contador nunca puede repetir un uid que ya existe en la partida.
    nextCreatureUid: Math.max(1, nextUid, highestUid + 1),
    encounter: parseEncounter(raw['encounter'], now),
    nextSpawnAt: nonNegative(raw['nextSpawnAt'], fallback.nextSpawnAt),
    // Un combate a medias no se restaura: se reanuda la vida normal.
    team: parseTeam(raw['team'], creatures),
    battle: null,
    activeZoneId: isZoneId(raw['activeZoneId']) ? raw['activeZoneId'] : STARTING_ZONE_ID,
    unlockedZoneIds: unlocked.length > 0 ? unlocked : [STARTING_ZONE_ID],
    bosses: parseBosses(raw['bosses'], now),
    achievements: parseAchievements(raw['achievements']),
    rngSeed: num(raw['rngSeed'], fallback.rngSeed) >>> 0,
  };
}

/** `raw` es el objeto ya des-serializado del almacenamiento. */
export function parseSaveFile(raw: unknown, now: number, fallbackSeed: number): SaveFile {
  if (!isRecord(raw)) throw new SaveParseError('La partida no es un objeto.');

  const migrated = migrate(raw);
  const fallback = createInitialState(now, fallbackSeed);

  return {
    version: SAVE_VERSION,
    savedAt: num(migrated['savedAt'], now),
    state: parseState(migrated['state'], fallback, now),
  };
}
