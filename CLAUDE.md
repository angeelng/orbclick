# Orbclick — guía para Claude Code

Juego *idle/clicker* de navegador en pixel art: el jugador clica el objeto central de una zona, gana monedas y XP, captura criaturas originales que trabajan en un Rancho (producción pasiva) o combaten en un equipo, y desbloquea nuevas zonas venciendo jefes.

El diseño completo está en `docs/GDD.md` (exportado del documento de diseño). **Si algo de este archivo choca con el GDD, manda el GDD.** Si el GDD no cubre algo, pregunta antes de inventar mecánicas.

## Restricciones innegociables

- **Sin motor gráfico ni framework de juego** (nada de Phaser, Pixi, Three, Unity…). Solo TypeScript, Canvas 2D y DOM.
- **Sin framework de UI** en el MVP (nada de React/Vue/Svelte). DOM con funciones pequeñas y suscripción al estado.
- **Contenido 100 % original**: no usar nombres, diseños ni términos de Pokémon, Palworld u otras marcas ("PokéBall", "Pikachu", etc.).
- **Pixel art nítido**: escalado entero, `imageSmoothingEnabled = false`, `image-rendering: pixelated`.
- MVP con **placeholders generados por código**; todo sprite se pide por `spriteId` para poder cambiar a hojas de sprites sin tocar la lógica.

## Stack y comandos

- Vite + TypeScript (`strict: true`), Vitest para tests, ESLint + Prettier.
- Gestor de paquetes: npm.

```bash
npm install
npm run dev        # servidor de desarrollo
npm run build      # build de producción en dist/
npm run test       # Vitest
npm run lint
```

## Estructura

```
src/
  data/          # contenido tipado: species.ts, zones.ts, items.ts, achievements.ts, balance.ts
  core/          # estado y reglas PURAS (sin DOM, sin window, sin Date.now, sin Math.random)
    state.ts     # tipo GameState + estado inicial
    economy.ts   # monedas por clic, CPS, precios
    capture.ts   # apariciones, probabilidad de captura
    ranch.ts     # puestos, saciedad, sinergias, offline
    combat.ts    # combate, tabla de tipos, habilidades
    progression.ts # XP, niveles, desbloqueos, logros
    rng.ts       # PRNG con semilla
  systems/       # bucle de juego (tick fijo 100 ms), bus de eventos tipado
  render/        # canvas de zona y Rancho, generador de placeholders, partículas
  ui/            # paneles DOM: topbar, tienda, fichas, combate, modales
  persistence/   # SaveRepository, LocalSaveRepository, migraciones, export/import
  styles/        # CSS con variables de la paleta
  main.ts
tests/           # espejo de core/ y persistence/
dashboard/       # dashboard de progreso de desarrollo (solo dev)
progress/        # progress.json (plan y estado) + metrics.json (generado)
scripts/         # progress-metrics.ts
docs/GDD.md
```

## Reglas de arquitectura

1. **`core/` es puro y determinista**: funciones `(estado, entrada, ahora, rng) → nuevo estado`. El tiempo y la aleatoriedad entran como parámetros. Debe poder ejecutarse en Node sin navegador (se reutilizará en un servidor de validación).
2. **Datos separados de estado**: `GameState` guarda IDs y progreso, nunca copias de definiciones de `data/`.
3. **Números de balance solo en `data/balance.ts`**. Ningún número mágico de gameplay en `core/`.
4. **Persistencia detrás de una interfaz**:
   ```ts
   interface SaveRepository {
     load(): Promise<SaveFile | null>;
     save(data: SaveFile): Promise<void>;
   }
   ```
   `SaveFile` lleva `version: number`. Cualquier cambio en `GameState` que rompa partidas añade una migración en `persistence/migrations.ts` y un test.
5. **Bucle**: `requestAnimationFrame` para render + acumulador para ticks lógicos fijos de 100 ms. Autoguardado cada 30 s y en `visibilitychange`.
6. **UI reactiva sencilla**: el estado emite eventos; los paneles se suscriben y repintan solo lo que cambia. Nada de repintar toda la tienda en cada tick.
7. **Economía envuelta**: la aritmética de monedas pasa por helpers (`add`, `mul`, `format`) para poder migrar a `break_infinity.js` más adelante.

## Estilo de código

- TypeScript estricto, sin `any`. Tipos de contenido con `as const` y uniones literales para IDs (`SpeciesId`, `ZoneId`…).
- Funciones pequeñas y con nombre claro. Comentarios solo cuando el "por qué" no es obvio.
- Identificadores en inglés; textos visibles al jugador en español, centralizados en `src/i18n/es.ts`.
- Cada función nueva de `core/` lleva tests en Vitest.

## Dirección visual

**Pergamino y roble**: pixel art dentro del lienzo, taberna medieval alrededor — tableros de madera, molduras doradas, pliegos de pergamino y tinta sepia. Nada de marcos de consola ni de pastel moderno.

- Paleta clara (variables CSS en `styles/tokens.css`): fondo madera `#4A2D16`, mesa `#6B4423`, pergamino `#F4E4C1`, pergamino hundido `#ECD6AB`/`#E0C593`, filete `#C9A469`, canto `#A97B43`, tinta `#3B2410`, secundario `#5E3E22`, apagado `#8A6A46`, acento `#9C5F22`, monedas `#B8862F`, éxito `#4E7A3A`, alerta `#A8352C`.
- Oro de las molduras: `#D8B45A`, reflejo `#F0D891`, sombra `#8C6522`. La madera de la barra y la mesa escribe sobre `--color-on-wood` (`#F5E3BD`), nunca sobre la tinta del pergamino.
- **Variante nocturna** en el mismo archivo (fondo `#1B110A`, pergamino curtido `#3A2918`, texto `#F2E0BB`, acento `#D99A42`): entra con la preferencia del sistema y con el conmutador de la barra superior. Cualquier color nuevo se define en las dos.
- Tipos, en pigmentos de iluminador: Planta `#7DA354`, Fuego `#CD6C2E`, Agua `#5C93BB`, Roca `#A98A60`, Eléctrico `#CFA92F`, Aire `#9AB6C4`.
- Formas: radios 4/7/10/14 px; la pastilla de 999 px queda solo para barras y recursos del HUD. Bordes de 2 px, sombras talladas con reflejo de vela arriba (`--shadow-carved`) y molduras por `box-shadow` inset en dos tonos de oro.
- Texturas reutilizables: `--texture-wood` (veta en `repeating-linear-gradient`) para barra, mesa y pestañas de móvil; `--texture-parchment` (dos radiales) para toda tarjeta de pergamino. Nunca imágenes de fondo externas.
- Layout de escritorio: HUD como tablón de madera + tres pliegos de pergamino sobre la mesa (zona · Rancho · tienda). En móvil se apilan con las pestañas inferiores. **La organización de los elementos no cambia; solo su acabado.**
- Canvas lógicos de referencia: zona 160×160, Rancho 256×160; escalado entero y el búfer estirado hasta llenar su caja. El lienzo va enmarcado como un cuadro: madera de 3 px y filete dorado interior.
- Fuentes: **Cinzel** (rótulos, nombres, cifras y botones; versalitas con `letter-spacing` holgado en los títulos de columna), **Alegreya Sans** (interfaz y texto corrido) y **Pixelify Sans solo dentro del arte** (números flotantes y cartel de la zona).
- Sprites: contorno de 1 px en un tono oscuro del propio color, nunca negro; se colocan por su base pintada para que apoyen en el suelo.
- Criaturas: mapas dibujados a mano de 16×16 en `render/creatureMaps.ts` (claves `O B L D A a` + `E W S` comunes). El objeto clicable mide 64×64, los orbes 12×12 y los iconos del HUD 8×8.

## Dashboard de progreso (obligatorio)

El proyecto incluye un **dashboard de desarrollo en tiempo real** donde el autor ve cómo avanza cada fase. Se crea en la fase 1, antes que el juego, y **se mantiene actualizado en cada tarea**.

### Fuente de verdad: `progress/progress.json`

Claude Code actualiza este archivo **al empezar y al terminar cada tarea** (no al final de la sesión). Esquema:

```ts
type TaskStatus = "pending" | "in_progress" | "done" | "blocked";

interface Progress {
  updatedAt: string;              // ISO 8601
  currentPhase: number;           // 1–7
  currentTask: string | null;     // id de la tarea en curso
  phases: {
    id: number;
    name: string;
    status: TaskStatus;
    startedAt: string | null;
    finishedAt: string | null;
    tasks: {
      id: string;                 // p. ej. "1.3"
      title: string;
      status: TaskStatus;
      notes?: string;             // qué se hizo, decisiones, motivo de bloqueo
      files?: string[];           // archivos principales tocados
      finishedAt?: string | null;
    }[];
  }[];
  log: {                          // más reciente primero, máx. 50 entradas
    at: string;
    phase: number;
    task: string;
    message: string;
  }[];
  blockers: { task: string; reason: string; needs: string }[];
}
```

- Al iniciar el proyecto, desglosa las 7 fases de abajo en tareas concretas (5–12 por fase) y escríbelas en `progress.json`.
- Si una tarea queda bloqueada o necesita una decisión del autor, márcala `blocked` y añádela a `blockers` con lo que hace falta.
- Si cambias el plan (tareas nuevas, divididas o descartadas), refléjalo en el archivo y en el `log`.

### Métricas automáticas: `progress/metrics.json`

Un script `npm run progress:metrics` genera este archivo con:
- Resultado de los tests (total, pasados, fallidos) usando el reporter JSON de Vitest.
- Cobertura de `core/` (porcentaje de líneas).
- Estado de `build` y `lint` (ok / error).
- Último commit (hash corto, mensaje, fecha) y número de commits.
- Líneas de código por carpeta de `src/`.

Ejecútalo al cerrar cada tarea, junto con la actualización de `progress.json`.

### La página: `dashboard/index.html`

- Página independiente servida por Vite en `http://localhost:5173/dashboard/` (segunda entrada en `vite.config.ts`). **No se incluye en el build de producción del juego.**
- Mismo estilo visual que el juego (paleta y fuentes de `styles/tokens.css`), TypeScript vanilla, sin librerías de gráficos (barras y anillos en CSS/SVG).
- **Tiempo real**: lee `progress.json` y `metrics.json` cada 3 s (o con el evento HMR de Vite cuando cambian) y repinta sin recargar. Muestra un indicador "actualizado hace X s".
- Contenido:
  1. **Resumen**: fase actual, tarea en curso, porcentaje global de tareas completadas.
  2. **Fases**: una tarjeta por fase con barra de progreso, estado, fechas y lista de tareas con su estado (desplegable).
  3. **Calidad**: tests pasados/fallidos, cobertura de `core/`, estado de build y lint.
  4. **Bloqueos**: lista destacada de lo que necesita decisión del autor.
  5. **Actividad**: el `log` como línea de tiempo, más reciente arriba.
- Script `npm run dashboard` que abre el servidor de desarrollo directamente en el dashboard.

## Plan por fases

Trabaja **una fase cada vez**. Al acabar cada fase el juego debe arrancar y ser jugable, con tests en verde. No adelantes funcionalidades de fases futuras.

1. **Esqueleto**: primero el **dashboard de progreso** (`progress/`, `dashboard/`, scripts `progress:metrics` y `dashboard`) con todas las fases desglosadas en tareas; después Vite + TS, layout de tres columnas con la paleta, bucle de juego, `GameState`, `LocalSaveRepository`, objeto clicable de la Pradera que da monedas y XP con feedback (número flotante + partículas).
2. **Economía**: tienda (mejoras de clic con precio `base × 1,15^n`), niveles de entrenador, formateo de números, autoguardado, exportar/importar partida.
3. **Captura**: apariciones por peso de rareza, debilitar a clics, orbes, probabilidad de captura, Reserva, generador de placeholders de criaturas.
4. **Rancho**: puestos y aptitudes, CPS, saciedad y bayas, niveles de criatura, sinergias, progreso offline (50 %, máx. 8 h).
5. **Combate**: equipo de hasta 3, combate automático en tiempo real, daño de clic, habilidades activas, tabla de tipos, bayas en combate.
6. **Zonas y jefes**: Cueva y Lago, los tres jefes con su mecánica, desbloqueos por nivel + jefe.
7. **Pulido**: logros, sonido, ajuste de balance, adaptación a móvil, despliegue en Cloudflare Pages.

## Definición de terminado (por tarea)

- `npm run build`, `npm run lint` y `npm run test` pasan.
- `progress/progress.json` refleja la tarea como `done` con sus notas, y `npm run progress:metrics` se ha ejecutado.
- La lógica nueva está en `core/` con tests; la UI solo lee estado y despacha acciones.
- Las partidas existentes cargan (migración si hizo falta).
- Sin números de balance fuera de `data/balance.ts`.
