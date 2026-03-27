# Tesseract Spatial Dashboard — Forward-Looking Reference

## Vision

A spatial interface where the user watches their application being understood in real-time. Elements glow as the system discovers them. Knowledge particles flow from the DOM into a growing library. Confidence overlays shimmer with iridescent indicators. The entire recursive improvement loop is visible as a living, breathing visualization — not a static report.

Two views work together:

1. **The Live Harvest View** — the actual application rendered as a texture plane, with the system's "eyes" visible as it probes elements, captures ARIA trees, and builds knowledge. Selectors glow bioluminescent as they're discovered. Bounding boxes pulse as elements are located.

2. **The Knowledge Observatory** — the growing library of screens, elements, aliases, confidence scores, rendered as a spatial graph that evolves. New knowledge arrives as particles from the harvest view. Confidence levels shimmer with iridescence. The graph grows and reorganizes as the system learns.

Both connected by **particle transport** — elements harvested from the live view animate into the observatory, carrying their metadata as color and intensity.

---

## Architecture

### Invariant: Projection, Never Dependency

The dashboard is a viewport into the pipeline, not a command center.

1. **Observation events flow freely** — `emit()` is fire-and-forget, never blocks the fiber.
2. **Decision gates are opt-in** — `awaitDecision()` always has a timeout fallback (default: instant auto-skip). The pipeline runs identically headless via `DisabledDashboard`.
3. **Toggling the frontend on/off must not change pipeline behavior or output.** The dashboard is a progressive enhancement layer.
4. **Any decision the dashboard can make, an agent or heuristic can also make.** The `DashboardPort` interface has multiple implementations: `DisabledDashboard` (headless), `WsDashboardAdapter` (human), `AgentDecider` (MCP agent), `DualModeDecider` (agent + human fallback). The dashboard is one consumer, not the only one.
5. **The frontend must not create adverse dependencies** that prevent the system from being operated entirely by agents or system heuristics.

### Effect Fiber Is the Source of Truth

The Effect fiber drives everything. It emits events as it processes:

```
Effect fiber (speedrun/dogfood loop)
    │
    ├── DashboardPort.emit('element-probed', { boundingBox, confidence })
    │       → WS → React → Three.js: glow particle spawns at DOM coordinates
    │
    ├── DashboardPort.emit('screen-captured', { imageBase64, width, height })
    │       → WS → React → Three.js: texture updates on screen plane
    │
    ├── DashboardPort.emit('knowledge-updated', { screen, element, confidence })
    │       → WS → React → Three.js: particle transports to observatory
    │
    ├── DashboardPort.awaitDecision(item)
    │       → fiber PAUSES → React shows decision UI → human clicks → fiber resumes
    │
    └── onProgress (iteration metrics, calibration drift)
            → WS → React: status bar + fitness gauges update
```

### Rendering Layers

```
┌─────────────────────────────────────────────────────────────┐
│ React 19 + Fiber Scheduler                                  │
│                                                             │
│ ┌─ DOM Layer (high priority, instant response) ───────────┐ │
│ │ StatusBar, DecisionPanel, Queue, FitnessCard            │ │
│ │ CSS transitions, TanStack Query, WebSocket              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─ Three.js Layer (react-three-fiber, 60fps) ─────────────┐ │
│ │ <Canvas>                                                │ │
│ │   <ScreenPlane />        ← live app screenshot texture  │ │
│ │   <SelectorGlows />      ← bioluminescent highlights    │ │
│ │   <ParticleTransport />  ← element → observatory flow   │ │
│ │   <GlassPane />          ← frosted overlay              │ │
│ │   <KnowledgeGraph />     ← spatial observatory          │ │
│ │   <EffectComposer>                                      │ │
│ │     <Bloom intensity={1.5} />                           │ │
│ │   </EffectComposer>                                     │ │
│ │ </Canvas>                                               │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Non-Blocking Ingestion Queue

The backend harvests selectors in milliseconds. The frontend animations need 300-500ms. Solution: **client-side animation pipeline with staggered playback**.

```
Backend:     emit A(5ms) emit B(5ms) emit C(5ms) emit D(5ms) emit E(5ms)
                ↓
Client buffer: [A, B, C, D, E]  (all arrive in ~25ms)
                ↓
Animation:   A starts ─→ 100ms ─→ B starts ─→ 100ms ─→ C starts...
             (staggered, overlapping, GPU-parallel via InstancedMesh)
```

The Effect fiber never blocks on animations. React's Fiber scheduler (`startTransition`) marks animation updates as low-priority while keeping decision UI instant.

---

## Technology Stack

### Core
- **React 19** — Fiber scheduler for priority-based concurrent rendering
- **react-three-fiber (R3F) v8.15+** — Declarative Three.js scene management
- **@react-three/drei** — Camera controls, text, helper components
- **@react-three/postprocessing** — Bloom, depth of field
- **Three.js r140+** — WebGL rendering with MeshPhysicalMaterial
- **TanStack Query v5** — REST data fetching + cache + mutations
- **Effect** — Server-side fiber runtime (already in project)

### Build
- **esbuild** — Switch dashboard entry from IIFE to ESM format for Three.js compatibility
- **HTML**: `<script type="module">` instead of plain `<script>`

### Materials & Shaders

| Effect | Material | Properties |
|--------|----------|------------|
| **Bioluminescent glow** | MeshStandardMaterial + Bloom | `emissive: 0x00ff88, emissiveIntensity: 1.5, toneMapped: false` |
| **Iridescent confidence** | MeshPhysicalMaterial | `iridescence: confidence, iridescenceIOR: 1.4, transmission: 0.5` |
| **Frosted glass pane** | MeshPhysicalMaterial | `transmission: 0.95, roughness: 0.1, ior: 1.33, clearcoat: 1.0` |
| **Particle trails** | InstancedMesh + custom shader | `gl_PointSize`, Fresnel-based alpha, color from confidence |

---

## DashboardEvent Extensions for Spatial View

```typescript
// New event types for the spatial visualization
export type DashboardEventKind =
  // ... existing events ...
  | 'element-probed'           // element located + bounding box
  | 'screen-captured'          // screenshot for texture plane
  | 'aria-snapshot-captured'   // ARIA tree captured
  | 'knowledge-updated'        // confidence/alias evolved
  | 'particle-spawn'           // trigger particle at coordinates

// Payloads
interface ElementProbedData {
  readonly element: string;
  readonly screen: string;
  readonly boundingBox: { x: number; y: number; width: number; height: number } | null;
  readonly locatorRung: number;
  readonly strategy: string;
  readonly found: boolean;
  readonly confidence: number;
}

interface ScreenCapturedData {
  readonly imageBase64: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

interface KnowledgeUpdatedData {
  readonly screen: string;
  readonly element: string;
  readonly confidence: number;
  readonly aliases: readonly string[];
  readonly status: 'approved-equivalent' | 'learning' | 'needs-review';
}
```

---

## ScreenObservationPort Extensions

The existing `ScreenObservationPort` needs bounding boxes and screenshots:

```typescript
export interface EnhancedScreenObservationResult extends ScreenObservationResult {
  readonly screenshot?: {
    readonly imageBase64: string;
    readonly width: number;
    readonly height: number;
  };
  readonly elementBoundingBoxes?: ReadonlyArray<{
    readonly element: string;
    readonly boundingBox: { x: number; y: number; width: number; height: number } | null;
  }>;
}
```

Playwright's `locator.boundingBox()` returns `{ x, y, width, height }` — maps directly to Three.js screen coordinates.

---

## React Component Tree

```
<App>
  <QueryClientProvider>
    <EffectStreamProvider wsUrl="/ws">

      {/* DOM Layer — CSS transitions, instant response */}
      <StatusBar />
      <DecisionPanel />        {/* approve/skip buttons, fiber pause UI */}

      {/* Three.js Layer — 60fps GPU rendering */}
      <SpatialCanvas>
        <PerspectiveCamera />
        <ambientLight />

        {/* The application being tested */}
        <ScreenPlane
          texture={screenshotStream}  {/* live texture from screenshot */}
          position={[0, 0, 0]}
        />

        {/* Glowing selectors on the DOM */}
        <SelectorGlowSystem
          probes={probedElements}     {/* from 'element-probed' events */}
          screenSize={viewportSize}
        />

        {/* Particles flowing from DOM to observatory */}
        <ParticleTransport
          source={probedElements}     {/* DOM coordinates */}
          target={observatoryPositions} {/* graph node coordinates */}
        />

        {/* Frosted glass overlay */}
        <GlassPane
          position={[0, 0, 0.1]}
          opacity={0.05}
        />

        {/* Knowledge graph observatory */}
        <KnowledgeObservatory
          screens={knowledgeScreens}
          position={[2, 0, 0]}       {/* offset to the right */}
        />

        {/* Post-processing effects */}
        <EffectComposer>
          <Bloom intensity={1.5} luminanceThreshold={0.2} />
        </EffectComposer>
      </SpatialCanvas>

      {/* Queue visualization — CSS animated */}
      <WorkQueue />
      <FitnessCard />

    </EffectStreamProvider>
  </QueryClientProvider>
</App>
```

---

## Implementation Phases

### Phase 1: R3F Integration + Screen Plane
- Install three, @react-three/fiber, @react-three/drei, @react-three/postprocessing
- Switch esbuild from IIFE to ESM for dashboard entry
- Create `<SpatialCanvas>` with basic scene (camera, lights, plane)
- Stream screenshots from ScreenObservationPort as texture
- **Milestone**: See the live application rendered in Three.js

### Phase 2: Selector Glow System
- Extend DashboardPort to emit `element-probed` events with bounding boxes
- Map DOM coordinates to Three.js screen space
- Spawn InstancedMesh particles at probe locations with emissive glow
- Add Bloom postprocessing for the bioluminescent effect
- **Milestone**: Watch elements light up as the system discovers them

### Phase 3: Particle Transport
- Animate particles from probe location to observatory position
- Use `Vector3.lerp` with cubic easing for smooth arcs
- Color particles by widget type or confidence score
- Trail effect via point sprites with decreasing alpha
- **Milestone**: See knowledge flowing from DOM to library

### Phase 4: Knowledge Observatory
- Render screens as card planes in 3D space
- Elements as nodes connected to their screen
- Confidence as iridescent material intensity
- Aliases as floating text labels (drei `<Text>`)
- Graph reorganizes as new knowledge arrives
- **Milestone**: A growing, living knowledge graph

### Phase 5: Glass Pane + Polish
- Frosted glass plane between DOM and observatory
- Depth of field effect (focus on active element)
- Camera transitions between harvest and observatory views
- Responsive layout (DOM UI adjusts around the canvas)
- **Milestone**: The "pane of glass" effect

### Phase 6: Human-in-the-Loop Integration
- Decision UI overlays the spatial view
- When fiber pauses for decision, the relevant element pulses brighter
- Approve/skip buttons float near the element in 3D space
- Decision triggers particle burst animation
- **Milestone**: Approve proposals by clicking glowing elements

---

## Performance Budget

| Component | Frame Cost | Budget |
|-----------|-----------|--------|
| InstancedMesh (5K particles) | 0.5ms | ✓ |
| Texture update (10fps screenshots) | 5-10ms | ✓ |
| Bloom postprocessing | 4-6ms | ✓ |
| Glass pane transmission | 1-2ms | ✓ |
| DOM layer (React reconciliation) | 2-4ms | ✓ |
| **Total** | **~15ms** | **60fps** ✓ |

---

## NPM Packages

```json
{
  "three": "^0.160.0",
  "@react-three/fiber": "^8.15.0",
  "@react-three/drei": "^9.88.0",
  "@react-three/postprocessing": "^2.10.0",
  "postprocessing": "^6.33.0",
  "@types/three": "^0.160.0"
}
```

---

## Key Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `dashboard/src/spatial/canvas.tsx` | NEW | Root R3F Canvas component |
| `dashboard/src/spatial/screen-plane.tsx` | NEW | Live app screenshot as texture |
| `dashboard/src/spatial/selector-glows.tsx` | NEW | Bioluminescent element highlights |
| `dashboard/src/spatial/particle-transport.tsx` | NEW | DOM → observatory particle flow |
| `dashboard/src/spatial/glass-pane.tsx` | NEW | Frosted glass overlay |
| `dashboard/src/spatial/knowledge-observatory.tsx` | NEW | Spatial knowledge graph |
| `dashboard/src/spatial/effects.tsx` | NEW | Bloom + depth of field |
| `lib/domain/types/dashboard.ts` | MODIFY | Add spatial event kinds |
| `lib/application/ports.ts` | MODIFY | Extend ScreenObservationResult |
| `lib/infrastructure/observation/playwright-screen-observer.ts` | MODIFY | Add bbox + screenshot |
| `scripts/build.cjs` | MODIFY | ESM format for dashboard |
| `dashboard/index.html` | MODIFY | `<script type="module">` |
| `package.json` | MODIFY | Add Three.js + R3F deps |
