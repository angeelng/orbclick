/**
 * Simula la curva completa del MVP con las reglas puras de `core/` para poder
 * ajustar `data/balance.ts` con datos en la mano en vez de a ojo (fase 7 ·
 * ajuste de balance).
 *
 * El jugador simulado es constante y razonable: clica a un ritmo fijo, pega a
 * la salvaje de turno, le lanza el orbe cuando está debilitada, reparte a las
 * criaturas por el puesto que mejor se les da, compra guantes, orbes, bayas,
 * plazas y mejoras de puesto en cuanto le llega, y reta al jefe de la zona en
 * cuanto se deja. No es un jugador óptimo: es el suelo de la experiencia.
 *
 * Uso: `npm run balance:curve -- [clics por segundo] [horas de tope]`
 */
import {
  addToTeam,
  clickEnemy,
  startBattle,
  startBossBattle,
  teamSlots,
  useAbility,
  useBerry,
} from '../src/core/combat';
import { clickDamage, coinsPerClick, format, upgradePrice, ownedCount } from '../src/core/economy';
import {
  buyBerries,
  buyOrbs,
  buyPostUpgrade,
  buyRanchSlot,
  buyUpgrade,
  applyClick,
  hitWild,
  tick,
  useOrb,
} from '../src/core/engine';
import { bossBlock, isUpgradeUnlocked } from '../src/core/progression';
import {
  creaturesInRanch,
  isPostUnlocked,
  postUpgradeLevel,
  postUpgradePrice,
  ranchProduction,
  ranchSlotPrice,
  ranchSlots,
  skillAt,
} from '../src/core/ranch';
import { requiresBattle } from '../src/core/capture';
import { createRng } from '../src/core/rng';
import { createInitialState, type GameState } from '../src/core/state';
import { BALANCE } from '../src/data/balance';
import { UPGRADE_LIST } from '../src/data/items';
import { ORB_LIST, type OrbId } from '../src/data/orbs';
import { POST_IDS } from '../src/data/posts';
import { getSpecies } from '../src/data/species';
import { ZONE_LIST, type ZoneId } from '../src/data/zones';

const TICK_MS = BALANCE.loop.tickMs;

interface Milestone {
  readonly level: number;
  readonly atMs: number;
  readonly coins: number;
  readonly perClick: number;
  readonly cps: number;
  readonly creatures: number;
  readonly achievements: number;
}

interface Report {
  readonly milestones: readonly Milestone[];
  readonly bossesDefeated: readonly { zoneId: ZoneId; atMs: number }[];
  readonly zonesOpened: readonly { zoneId: ZoneId; atMs: number }[];
  readonly finalState: GameState;
  readonly elapsedMs: number;
  readonly clicks: number;
  readonly battlesWon: number;
  readonly battlesLost: number;
  readonly battlesTimedOut: number;
}

function rngOf(state: GameState) {
  return createRng(state.rngSeed);
}

/** Orbe más potente que el jugador tiene en la mochila. */
function bestOrb(state: GameState): OrbId | null {
  const owned = [...ORB_LIST].reverse().find((orb) => (state.orbs[orb.id] ?? 0) > 0);
  return owned?.id ?? null;
}

/** Puesto que mejor le va a una criatura, o `null` si no sirve para ninguno. */
function bestPost(state: GameState, speciesId: GameState['creatures'][number]['speciesId']) {
  const creature = { speciesId } as GameState['creatures'][number];
  const open = POST_IDS.filter((postId) => isPostUnlocked(state, postId));
  let best: (typeof POST_IDS)[number] | null = null;
  let bestSkill = 0;
  for (const postId of open) {
    const skill = skillAt(creature, postId);
    if (skill > bestSkill) {
      bestSkill = skill;
      best = postId;
    }
  }
  return best;
}

/** Compras del tick: guantes, orbes, bayas, plazas y mejoras de puesto. */
function shop(state: GameState, now: number): GameState {
  let next = state;

  // Orbes: la captura es el motor del Rancho, así que van primero.
  for (const orb of [...ORB_LIST].reverse()) {
    if (next.trainer.level < orb.unlockLevel) continue;
    const held = next.orbs[orb.id] ?? 0;
    if (held >= 5) continue;
    const result = buyOrbs(next, orb.id, 1, now);
    if (result.bought) next = result.state;
    break;
  }

  // Bayas: sin comedero el Rancho se para, y son baratas.
  if (next.berries < 20 && next.trainer.level >= BALANCE.berries.unlockLevel) {
    const result = buyBerries(next, 10, now);
    if (result.bought) next = result.state;
  }

  // Plaza de Rancho cuando no queda sitio para la siguiente captura.
  if (creaturesInRanch(next).length >= ranchSlots(next) && next.coins > ranchSlotPrice(next) * 2) {
    const result = buyRanchSlot(next, now);
    if (result.bought) next = result.state;
  }

  // Guantes: el escalón más alto que esté a la venta y quepa en la cartera.
  for (const upgrade of [...UPGRADE_LIST].reverse()) {
    if (!isUpgradeUnlocked(next, upgrade)) continue;
    const price = upgradePrice(upgrade, ownedCount(next.upgrades, upgrade.id));
    if (next.coins < price * 1.5) continue;
    const result = buyUpgrade(next, upgrade.id, 1, now);
    if (result.bought) next = result.state;
    break;
  }

  // Mejoras de puesto: solo con holgura, que son caras y no urgen.
  for (const postId of POST_IDS) {
    if (!isPostUnlocked(next, postId)) continue;
    if (postUpgradeLevel(next, postId) >= BALANCE.ranch.maxPostUpgrades) continue;
    const price = postUpgradePrice(next, postId);
    if (next.coins < price * 4) continue;
    const result = buyPostUpgrade(next, postId, now);
    if (result.bought) next = result.state;
    break;
  }

  return next;
}

/** Reparte a quien esté sin puesto y completa el equipo de combate. */
function manageRanch(state: GameState, now: number): GameState {
  let next = state;

  for (const creature of next.creatures) {
    if (creature.location !== 'ranch' || creature.postId !== null) continue;
    if (next.team.includes(creature.uid)) continue;
    const postId = bestPost(next, creature.speciesId);
    if (postId === null) continue;
    next = {
      ...next,
      creatures: next.creatures.map((entry) =>
        entry.uid === creature.uid ? { ...entry, postId } : entry,
      ),
    };
  }

  // El equipo se llena con lo que más PV tenga: es lo que aguanta a un jefe.
  while (next.team.length < teamSlots(next)) {
    const candidates = next.creatures
      .filter((creature) => !next.team.includes(creature.uid))
      .sort((a, b) => getSpecies(b.speciesId).stats.hp - getSpecies(a.speciesId).stats.hp);
    const pick = candidates[0];
    if (pick === undefined) break;
    const result = addToTeam(next, pick.uid, now);
    if (!result.changed) break;
    next = result.state;
  }

  return next;
}

export function simulate(clicksPerSecond: number, maxHours: number, seed = 20_261_018): Report {
  let state = createInitialState(0, seed);
  let now = 0;
  let clickCredit = 0;
  let clicks = 0;
  let battlesWon = 0;
  let battlesLost = 0;
  let battlesTimedOut = 0;

  const milestones: Milestone[] = [];
  const bossesDefeated: { zoneId: ZoneId; atMs: number }[] = [];
  const zonesOpened: { zoneId: ZoneId; atMs: number }[] = [];
  const limitMs = maxHours * 60 * 60 * 1000;

  const record = (level: number): void => {
    milestones.push({
      level,
      atMs: now,
      coins: state.coins,
      perClick: coinsPerClick(state),
      cps: ranchProduction(state).cps,
      creatures: state.creatures.length,
      achievements: state.achievements.length,
    });
  };
  record(1);

  while (now < limitMs && state.trainer.level < BALANCE.trainer.maxLevel) {
    now += TICK_MS;
    clickCredit += (clicksPerSecond * TICK_MS) / 1000;

    while (clickCredit >= 1) {
      clickCredit -= 1;
      clicks += 1;

      if (state.battle !== null) {
        state = clickEnemy(state, clickDamage(state));
        continue;
      }
      const { encounter } = state;
      // A la salvaje se le pega solo si se deja; las raras piden combate.
      if (encounter !== null && !requiresBattle(encounter) && encounter.hp > 1) {
        state = hitWild(state, now, rngOf(state)).state;
      } else {
        state = applyClick(state, now).state;
      }
    }

    // Habilidades y bayas: en cuanto una está cargada o alguien flaquea.
    if (state.battle !== null) {
      for (const battler of state.battle.team) {
        if (battler.hp <= 0) continue;
        if (battler.charge >= 1) {
          const result = useAbility(state, battler.uid, now, rngOf(state));
          if (result.used) state = result.state;
        }
        if (battler.hp < battler.maxHp * 0.4) {
          const result = useBerry(state, battler.uid);
          if (result.used) state = result.state;
        }
      }
    }

    // El orbe entra cuando la salvaje está lo bastante tocada.
    const { encounter } = state;
    if (encounter !== null && state.battle === null) {
      const weakened = requiresBattle(encounter)
        ? encounter.hp <= 0
        : encounter.hp <= encounter.maxHp * 0.35;
      const orbId = bestOrb(state);
      if (weakened && orbId !== null) state = useOrb(state, orbId, now, rngOf(state)).state;
    }

    const step = tick(state, now, rngOf(state));
    state = step.state;
    if (step.battleOutcome === 'won') battlesWon += 1;
    if (step.battleOutcome === 'lost') battlesLost += 1;
    if (step.battleOutcome === 'timeout') battlesTimedOut += 1;
    if (step.bossDefeatedZoneId !== null) {
      bossesDefeated.push({ zoneId: step.bossDefeatedZoneId, atMs: now });
    }
    for (const zoneId of step.unlockedZoneIds) zonesOpened.push({ zoneId, atMs: now });

    const reached = state.trainer.level;
    if (reached > (milestones[milestones.length - 1]?.level ?? 1)) record(reached);

    // Decisiones lentas: una vez por segundo basta y el bucle corre más.
    if (now % 1000 === 0) {
      state = shop(state, now);
      state = manageRanch(state, now);

      // Viajar a la zona más profunda abierta: paga más y abre especies nuevas.
      const deepest = [...ZONE_LIST]
        .reverse()
        .find((zone) => state.unlockedZoneIds.includes(zone.id));
      if (deepest !== undefined && deepest.id !== state.activeZoneId && state.battle === null) {
        state = { ...state, activeZoneId: deepest.id };
      }

      // Las raras no se dejan debilitar a clics: se retan con el equipo.
      const wild = state.encounter;
      if (state.battle === null && wild !== null && wild.hp > 0 && requiresBattle(wild)) {
        const result = startBattle(state, now);
        if (result.started) state = result.state;
      }

      // Jefe: se reta en cuanto se deja y hay equipo en pie.
      if (state.battle === null && state.team.length > 0) {
        for (const zone of ZONE_LIST) {
          if (bossBlock(state, zone.id, now) !== null) continue;
          const result = startBossBattle(state, zone.id, now);
          if (result.started) {
            state = result.state;
            break;
          }
        }
      }
    }
  }

  if ((milestones[milestones.length - 1]?.level ?? 0) < state.trainer.level) {
    record(state.trainer.level);
  }

  return {
    milestones,
    bossesDefeated,
    zonesOpened,
    finalState: state,
    elapsedMs: now,
    clicks,
    battlesWon,
    battlesLost,
    battlesTimedOut,
  };
}

function hours(ms: number): string {
  const totalMinutes = Math.round(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}

function pad(value: string, width: number): string {
  return value.padStart(width, ' ');
}

function printReport(label: string, report: Report): void {
  console.log(`\n=== ${label} ===`);
  console.log('Nivel  Tiempo        Monedas/clic      CPS   Criaturas  Logros');
  for (const milestone of report.milestones) {
    console.log(
      [
        pad(String(milestone.level), 5),
        pad(hours(milestone.atMs), 13),
        pad(format(milestone.perClick), 12),
        pad(format(milestone.cps), 9),
        pad(String(milestone.creatures), 11),
        pad(String(milestone.achievements), 7),
      ].join(''),
    );
  }

  for (const boss of report.bossesDefeated) {
    console.log(`Jefe de ${boss.zoneId} vencido a las ${hours(boss.atMs)}`);
  }
  for (const zone of report.zonesOpened) {
    console.log(`Zona ${zone.zoneId} abierta a las ${hours(zone.atMs)}`);
  }

  const state = report.finalState;
  console.log(
    [
      `Fin: nivel ${state.trainer.level} tras ${hours(report.elapsedMs)}`,
      `${report.clicks} clics`,
      `${state.stats.totalCaptures} capturas de ${state.stats.totalOrbsThrown} orbes`,
      `combates ganados ${report.battlesWon}, perdidos ${report.battlesLost}, agotados ${report.battlesTimedOut}`,
      `${state.achievements.length} logros`,
      `${format(state.coins)} monedas`,
    ].join(' · '),
  );
}

const [clicksArg, hoursArg] = process.argv.slice(2);
const clicksPerSecond = Number(clicksArg ?? 4);
const maxHours = Number(hoursArg ?? 12);

printReport(
  `Jugador activo (${clicksPerSecond} clics/s, tope ${maxHours} h)`,
  simulate(clicksPerSecond, maxHours),
);
printReport('Jugador tranquilo (1 clic/s, tope 24 h)', simulate(1, 24));
