/**
 * Todos los números de gameplay viven aquí (GDD · Fórmulas y valores iniciales).
 * `core/` no debe contener ninguna constante de balance.
 */
export const BALANCE = {
  /**
   * Nivel de entrenador: XP(n) = base · growth^(n-1) para pasar de n a n+1.
   *
   * Ajuste de la fase 7 con `npm run balance:curve`: con la curva de arranque
   * (100 · 1,5^n) un jugador de cuatro clics por segundo se ventilaba los
   * quince niveles en media hora, antes de ver funcionar el Rancho. Con
   * 240 · 1,58^n el MVP dura unas tres horas y media de juego activo y unas
   * doce de juego tranquilo, que es donde la producción pasiva se nota.
   */
  trainer: {
    xpBase: 240,
    xpGrowth: 1.58,
    maxLevel: 15,
  },

  /** Clic sobre el objeto de la zona. */
  click: {
    /** Monedas base antes de bonus: M_clic = (1 + plano) · mult · (1 + minería) · (1 + global). */
    baseCoins: 1,
    /** XP de entrenador por clic. */
    baseXp: 1,
    /** Daño de clic del jugador (debilitar salvajes, fase 3). */
    baseDamage: 1,
  },

  /** Tienda. */
  shop: {
    /** Precio de una mejora repetible: base · growth^cantidad (GDD). */
    priceGrowth: 1.15,
    /**
     * Veces que se puede comprar una misma mejora. Sin tope, el precio ×1,15
     * acaba siendo calderilla y una sola mejora se come la progresión; con
     * diez escalones cada guante se agota y hay que subir al siguiente.
     */
    maxUpgradeOwned: 10,
  },

  /** Captura: apariciones, PV de las salvajes y probabilidad del orbe. */
  capture: {
    /** Segundos entre apariciones; el puesto de Exploración lo baja (fase 4). */
    spawnMinMs: 45_000,
    spawnMaxMs: 90_000,
    /** La salvaje se queda este rato antes de huir. */
    encounterMs: 20_000,
    /** PV de una común de la primera zona. */
    baseWildHp: 15,
    /** ×1,8 por cada zona más adentro y ×2 por cada escalón de rareza. */
    hpPerZone: 1.8,
    hpPerRarityStep: 2,
    /** Tope de probabilidad: nunca hay captura segura con estos orbes. */
    maxCaptureChance: 0.95,
    /** Peso del daño acumulado en la fórmula de captura. */
    weakenWeight: 1.5,
    /** Si el orbe falla, la criatura huye con esta probabilidad. */
    fleeAfterFailChance: 0.5,
    /**
     * XP de entrenador por pelear con una salvaje, en fracciones de la XP que
     * daría capturarla (tabla de rarezas). Agotarle la barra entera paga
     * `weakenXpShare` y rematarla añade `defeatXpShare`, así que machacarla
     * nunca renta tanto como meterla en un orbe.
     */
    weakenXpShare: 0.3,
    defeatXpShare: 0.3,
    /** Una de cada N apariciones es variocolor. */
    shinyOdds: 500,
    /** Producción ×2 de una variocolor (fase 4). */
    shinyProduction: 2,
  },

  /**
   * Derrotar a una salvaje a clics: `monedas = PV_max · M_clic · bonus_rareza`.
   * Escala sola con la zona y la rareza porque los PV ya lo hacen, y crece con
   * las mejoras de clic.
   */
  defeat: {
    rarityBonus: {
      common: 1.5,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 6,
    },
  },

  /** Rarezas: probabilidad base de captura, peso de aparición y XP. */
  rarity: {
    common: { captureBase: 0.4, spawnWeight: 60, captureXp: 10 },
    uncommon: { captureBase: 0.25, spawnWeight: 28, captureXp: 25 },
    rare: { captureBase: 0.12, spawnWeight: 10, captureXp: 60 },
    epic: { captureBase: 0.06, spawnWeight: 2, captureXp: 150 },
    legendary: { captureBase: 0.03, spawnWeight: 0, captureXp: 500 },
  },

  /**
   * Rancho. El GDD fija la fórmula del CPS, la saciedad, las sinergias y el
   * progreso offline; el rendimiento del resto de puestos es un punto de
   * partida para ajustar aquí sin tocar la lógica.
   */
  ranch: {
    startingSlots: 4,
    maxSlots: 16,
    /** Plaza extra número k: 500 · 2^k monedas (GDD). */
    slotBasePrice: 500,
    slotPriceGrowth: 2,

    /** Saciedad: baja 1 punto por minuto trabajando (GDD). */
    satietyDrainPerMinute: 1,
    /** Por encima del umbral rinde al 100 %, entre 1 y el umbral al 60 %, a 0 para. */
    satietyThreshold: 50,
    satietyLowFactor: 0.6,
    /** El comedero reparte una baya cuando una criatura baja de este punto. */
    feederThreshold: 50,
    /** Saciedad que repone una baya. */
    berryRestore: 40,

    /** Cada nivel de criatura suma un 5 % de producción (GDD). */
    levelProductionBonus: 0.05,
    /** XP de criatura para subir de nivel: 50 · 1,4^(L−1) (GDD). */
    creatureXpBase: 50,
    creatureXpGrowth: 1.4,
    maxCreatureLevel: 20,
    /** Las variocolor producen el doble (GDD). */
    shinyProductionBonus: 2,

    /** Mejoras de puesto: +25 % por nivel, 3 niveles (GDD). */
    postUpgradeBonus: 0.25,
    maxPostUpgrades: 3,

    /**
     * Rendimiento por punto de aptitud efectivo. Solo el CPS viene del GDD
     * (0,5 por punto); el resto son valores de arranque.
     */
    output: {
      cpsPerSkill: 0.5,
      miningPerSkill: 0.1,
      berriesPerSkillPerMinute: 0.5,
      orbsPerSkillPerMinute: 0.08,
      orbDiscountPerSkill: 0.02,
      maxOrbDiscount: 0.3,
      spawnSpeedPerSkill: 0.02,
      maxSpawnSpeed: 0.5,
      nurseryXpPerSkillPerMinute: 0.6,
    },

    /** Sinergias de tipo; cada par cuenta una vez (GDD). */
    synergies: [
      { types: ['water', 'plant'], effect: 'berries', bonus: 0.15 },
      { types: ['fire', 'rock'], effect: 'mining', bonus: 0.1 },
      { types: ['electric', 'air'], effect: 'cps', bonus: 0.1 },
    ],

    /** Progreso offline: la mitad de la producción, con tope de 8 horas. */
    offline: {
      factor: 0.5,
      maxMs: 8 * 60 * 60 * 1000,
      /** Por debajo de esto no se enseña el resumen: no merece la pena. */
      minMs: 60_000,
    },
  },

  /** Combate (GDD · Combate y jefes de zona). */
  combat: {
    /** Cada criatura ataca cada `2 / (1 + VEL/100)` segundos. */
    attackBaseMs: 2000,
    /** Estadísticas al nivel L: base × (1 + 0,08 (L − 1)). */
    statPerLevel: 0.08,
    /** Variación del daño: v ∈ [0,9; 1,1]. */
    damageVarianceMin: 0.9,
    damageVarianceMax: 1.1,
    /** Multiplicadores de la tabla de tipos. */
    typeStrong: 1.5,
    typeWeak: 0.67,
    /** Daño mínimo de un golpe: nunca se queda en cero. */
    minDamage: 1,

    /** Equipo: una plaza al nivel 3, dos al 6 y tres al 8 (GDD). */
    teamUnlockLevels: [3, 6, 8],
    maxTeamSize: 3,

    /** Cada clic del jugador carga un 2 % la barra de habilidad. */
    clickChargePercent: 0.02,
    /** El escudo dura esto antes de caerse solo. */
    shieldMs: 8000,
    /** Las bayas curan un 30 % de los PV, máximo tres por combate. */
    berryHealPercent: 0.3,
    maxBerriesPerBattle: 3,
    /** Quien cae queda agotado dos minutos: ni trabaja ni combate. */
    exhaustionMs: 2 * 60 * 1000,
    /** Si el combate se eterniza, la salvaje se marcha. */
    maxBattleMs: 90_000,

    /**
     * Jefes de zona (GDD · Combate y jefes de zona). El GDD fija los PV ×10,
     * el enfriamiento de 30 min para volver a retarlo y el ritmo de cada
     * mecánica; el resto (lo que pega la oleada, los clics que aguanta el
     * escudo, cuánto más lento ataca un jefe y su combate más largo) son
     * valores de arranque para ajustar en la fase 7.
     */
    boss: {
      /** PV ×10 respecto a una salvaje común de su zona. */
      hpMultiplier: 10,
      /** Se puede volver a retar cada media hora para farmear. */
      retryCooldownMs: 30 * 60 * 1000,
      /** Pega más fuerte que una salvaje, así que pega más espaciado. */
      attackIntervalFactor: 1.6,
      /** Un jefe aguanta más que una salvaje antes de que se corte el combate. */
      maxBattleMs: 180_000,
      /** Monedas y XP: un jefe paga el doble que una salvaje de sus PV. */
      rewardMultiplier: 2,
      /** Cornavid: se cura un 5 % de sus PV máximos cada 10 s. */
      regrowth: { percent: 0.05, intervalMs: 10_000 },
      /** Geodrón: cada 15 s levanta un escudo que solo rompen los clics. */
      stoneShield: { hits: 6, intervalMs: 15_000 },
      /** Marealis: cada 20 s golpea a todo el equipo a la vez. */
      tideWave: { power: 0.9, intervalMs: 20_000 },
    },

    /** Botín de la victoria, sobre la XP de captura de la rareza. */
    /**
     * Escalon de rareza desde el que una salvaje exige combate en vez de
     * dejarse debilitar a clics (GDD · Captura: rara o superior).
     */
    battleRarityStep: 2,
    victoryXpShare: 0.8,
    victoryCoinsPerHp: 1.5,
  },

  /**
   * Logros (GDD · Progresión, tienda, logros y offline). Cada logro suma un
   * +1 % de producción global permanente, que entra en el término `global` de
   * la fórmula del clic y por tanto también en las monedas del Rancho.
   */
  achievements: {
    globalBonus: 0.01,
  },

  /** Bayas de la tienda (GDD · nivel 2). */
  berries: {
    price: 25,
    unlockLevel: 2,
  },

  /** Bonus del tipo favorecido de la zona activa. */
  zone: {
    favoredTypeMultiplier: 1.25,
  },

  /** Ritmo del bucle y del guardado. */
  loop: {
    tickMs: 100,
    autosaveMs: 30_000,
    /** Tope de dt por fotograma: evita saltos enormes al volver de una pestaña inactiva. */
    maxFrameMs: 1000,
  },

  /** Feedback visual del clic (GDD · Dirección visual). */
  feedback: {
    particlesMin: 4,
    particlesMax: 6,
    particleLifeMs: 520,
    particleSpeed: 34,
    particleGravity: 90,
    squashMs: 80,
    squashScale: 0.95,
    floatingTextMs: 900,
    /** Cuánto se queda en pantalla el cartel de la zona. */
    bannerMs: 3000,
    /**
     * Clics automáticos del Campo de recolección: se animan al ritmo real del
     * CPS, pero con un tope para que un Rancho grande no convierta la zona en
     * una tormenta de partículas. El número flotante se calla antes todavía.
     */
    autoClickMaxPerSecond: 6,
    autoClickTextMaxPerSecond: 3,
    /** Animación de lanzar el orbe, por tramos. */
    orbFlightMs: 300,
    orbAbsorbMs: 200,
    orbShakeMs: 900,
    orbResultMs: 360,
  },
} as const;
