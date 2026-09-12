# Kinetic Narrative Frame Operational Grammar V1

## Status

- Work item: `TASK-KNF-01B`
- State: `SPEC LOCK CANDIDATE`
- Scope: operational image-design and image-to-clip grammar for the History / Mystery channel
- Parent paradigm: `KINETIC_NARRATIVE_FRAME_V1`
- Branch: `design/kinetic-narrative-frame-operational-v1`
- Base: `design/kinetic-narrative-frame-v1`
- This document translates the KNF paradigm into repeatable generation rules.
- This document does **not** yet change canonical resources, project DB schema, WF-09, provider profiles, browser transport, or production assets.

---

## 1. Purpose

`Kinetic Narrative Frame V1` establishes the principle:

> A generated image is not a paused illustration. It is a narrative frame containing the trace of the previous action and the directional force of the next action.

`Operational Grammar V1` answers the next question:

> **What must be designed before generation so that this principle survives contact with an image model?**

The purpose of this grammar is to prevent KNF prompts from collapsing back into generic cinematic historical reconstruction.

The image model must not be asked only for "motion," "dynamic composition," or "cinematic energy." Those terms are too weak and usually converge toward familiar film-still or concept-art patterns.

Instead, every frame is designed as a structured temporal-spatial system.

---

## 2. Operational priority

Every frame is designed in this order:

```text
1. STORY MESSAGE
2. NARRATIVE BEAT TYPE
3. T-1 / T0 / T+1 TIME ENVELOPE
4. TRACE / ACTION / EXIT FIELDS
5. KINETIC AXIS
6. MOTION CARRIERS
7. OUTGOING CUE + OPEN EDGE
8. HANDOFF TO NEXT FRAME
9. DETAIL / FACTUALITY BUDGET
10. SURFACE TREATMENT
11. PROMPT COMPILATION
12. CLIP MOTION INTENT
```

Surface style is intentionally late in the process.

A beautiful surface cannot rescue a frame with no story movement.

---

## 3. Required Frame Design Card

Before an image prompt is compiled, the frame should conceptually expose the following fields.

```text
frameId
storyMessage
narrativeBeatType
certaintyMode

timeEnvelope:
  tMinus1
  t0
  tPlus1

spatialFields:
  traceField
  actionField
  exitField

kineticAxis:
  primary
  secondaryOptional

motionCarriers[]
incomingTrace
presentAction
outgoingCue
openEdge
subjectScale
environmentFunction
detailBudget

handoff:
  incomingAnchor
  outgoingAnchor
  transformToNext

clipIntent:
  cameraMotion
  environmentalMotion
  revealMechanism

factualConstraints[]
avoidances[]
```

These are operational design fields in V1. They are **not yet** a database schema contract.

---

## 4. The three-field composition system

Every KNF frame should be readable as three connected narrative fields.

### 4.1 TRACE FIELD

The region that carries evidence of the previous moment.

It answers:

> Where did the story come from?

Typical devices:

- receding figures,
- footprints,
- disturbed ground,
- trailing smoke,
- cloth already displaced by wind,
- open gate behind a subject,
- road already travelled,
- repeated forms diminishing backward,
- partial remnants,
- previous-direction shadows.

The Trace Field should usually carry **less visual authority than T0**.

Preferred treatment:

- lower contrast,
- softer or interrupted edges,
- smaller repeated forms,
- partial occlusion,
- visual residue rather than exposition.

### 4.2 ACTION FIELD

The region where the current narrative relation is clearest.

It answers:

> What is changing now?

This is normally the most readable field, but it does not require a large centered subject.

Preferred treatment:

- strongest structural clarity,
- clearest directional relation,
- controlled local contrast,
- readable body or group direction,
- readable threshold / collision / branch / break.

### 4.3 EXIT FIELD

The region containing the next-beat pull.

It answers:

> Where does the story want to go next?

Typical devices:

- road leaving frame,
- open doorway,
- distant unresolved structure,
- negative space in the direction of travel,
- branch that continues beyond view,
- shoreline turning out of frame,
- light band leading away,
- empty region where an expected continuation should be.

Preferred treatment:

- lower object density,
- stronger directional simplicity,
- less decorative detail,
- enough openness for the eye to continue.

### 4.4 Important rule

The three fields do **not** need to occupy literal thirds of the image.

They may curve, overlap, compress, reverse, or form diagonal paths.

The required property is temporal readability, not geometric symmetry.

---

## 5. Channel signature: Temporal Edge Flow

The core visual signature of Operational Grammar V1 is `TEMPORAL_EDGE_FLOW`.

Instead of making every part of a frame equally detailed, visual clarity changes along the narrative direction.

```text
T-1 / TRACE
broken, softer, residual
        ↓
T0 / ACTION
clearest, most readable relation
        ↓
T+1 / EXIT
open, simplified, directional
```

This is not depth-of-field simulation.

It is **narrative edge hierarchy**.

The purpose is to make the eye feel time and direction even in a still frame.

Reject if:

- everything is equally sharp and decorative,
- the center is sharp only because of fake photographic focus,
- blur replaces actual compositional movement,
- the exit area becomes visually busier than the story action without narrative reason.

---

## 6. Kinetic axis rules

### 6.1 One dominant direction

Every frame normally has one primary kinetic axis.

Allowed primary axes:

```text
LEFT_TO_RIGHT
RIGHT_TO_LEFT
NEAR_TO_FAR
FAR_TO_NEAR
LOW_TO_HIGH
HIGH_TO_LOW
CURVED_PATH
CONVERGING
DIVERGING
CIRCULAR_PRESSURE
INTERRUPTED_AXIS
```

A secondary axis may exist only if it serves the beat.

Examples:

- `COLLISION` may require opposing axes.
- `BRANCH` requires controlled divergence.
- `PRESSURE` may use converging secondary geometry.

### 6.2 Axis reinforcement

At least **three independent visual systems** should support the primary axis whenever the scene allows.

Possible systems:

```text
SUBJECT BODY DIRECTION
GROUP SPACING
ROAD / CORRIDOR / SHORELINE
ARCHITECTURAL PERSPECTIVE
CLOTH / HAIR / VEGETATION FLOW
SMOKE / RAIN / SNOW / DUST
LIGHT / SHADOW BAND
REPEATED SHAPES
FOREGROUND CROPPING
TERRAIN SLOPE
WAVE OR WATER FLOW
```

This is how motion becomes structural instead of decorative.

### 6.3 Do not over-signal

Literal arrows, speed lines, streaks, or graphic motion marks are not default devices.

Use them only if a later approved channel style explicitly adopts them.

The default KNF goal is for **the world itself to carry the motion**.

---

## 7. Motion Carrier Grammar

A normal frame should use **2 to 4 meaningful motion carriers**.

Too few often produces a static tableau.

Too many can become visual noise.

### Carrier classes

#### BODY

- walking angle,
- turning torso,
- staggered formation,
- gesture toward exit,
- running only when story-appropriate.

#### ENVIRONMENT

- wind in grass,
- waves,
- dust,
- smoke,
- snow,
- rain,
- moving branches,
- water current.

#### GEOMETRY

- road,
- corridor,
- repeated doors,
- wall line,
- bridge,
- shoreline,
- mountain pass,
- converging roof lines.

#### VALUE / LIGHT

- moving band of illumination,
- directional shadow,
- bright opening,
- dark mass compressing a route.

#### RHYTHM

- repeated people,
- posts,
- columns,
- footprints,
- windows,
- gaps,
- alternating masses.

At least one carrier should normally be structural rather than atmospheric.

Fog, smoke, rain, or cloth alone are not enough.

---

## 8. Subject placement and scale

### 8.1 Default scale

```text
SMALL
SMALL_TO_MEDIUM
```

`MEDIUM` is allowed when the narrative relation requires it.

`LARGE` is exceptional.

### 8.2 Placement rule

Do not center the main subject by default.

Subject placement should normally create unequal space:

```text
less space behind the completed action
more usable space toward the next action
```

This creates visual future-space.

### 8.3 Large-subject exceptions

A larger subject may be justified by:

- `COLLISION`,
- irreversible emotional change,
- decisive recognition,
- evidence that genuinely changes the story,
- a deliberate rhythmic contrast before returning to broader narrative distance.

Even then, the frame must retain an outgoing cue.

---

## 9. Open-edge rule

Every continuing beat should designate one `openEdge`:

```text
LEFT
RIGHT
TOP
BOTTOM
DEPTH
MULTIPLE_CONTROLLED
```

The open edge is the side or depth region through which narrative energy continues.

The composition should not block every route with equal visual weight.

Exceptions:

- `PRESSURE` may deliberately compress the open edge.
- `BREAK` may abruptly terminate a previously readable edge.
- `ABSENCE` may make the missing continuation itself the point.

These exceptions still need a next-beat cue at the sequence level.

---

## 10. Beat-specific operational grammar

### 10.1 MOVE

Required:

- one strong trajectory,
- readable origin residue,
- subject or group already mid-transition,
- destination or exit not fully reached,
- open continuation.

Prefer:

- staggered spacing,
- near-to-far depth,
- diagonal or curved route,
- environmental flow aligned with travel.

Avoid:

- marching pose line facing camera,
- centered parade composition,
- destination fully resolved inside frame,
- excessive equipment detail.

### 10.2 REVEAL

Required:

- previously concealed information becoming readable,
- visible relationship between old assumption and new information,
- a reveal path or occlusion change.

Prefer:

- doorway,
- foreground obstruction,
- turning path,
- material layer opening,
- evidence entering context rather than isolated close-up.

Avoid:

- object glamour shot,
- hard cut to an unrelated evidence portrait,
- readable invented text.

### 10.3 PRESSURE

Required:

- space or forces visibly constraining possibility,
- converging or narrowing structure,
- directional opposition.

Prefer:

- corridors,
- repeated barriers,
- narrowing gaps,
- crowd flow against subject flow,
- compressing architecture.

Avoid:

- generic dark mood without structural pressure,
- large facial expression as the sole carrier.

### 10.4 COLLISION

Required:

- two meaningful forces or interpretations meeting,
- opposing or intersecting vectors.

Prefer:

- asymmetrical balance,
- geometric intersection,
- opposing movement rhythms.

Avoid:

- spectacle-only battle tableau,
- explosion / impact used only for excitement.

### 10.5 BREAK

Required:

- a previously readable rhythm or route visibly stops,
- interruption must be legible without inventing unsupported historical events.

Prefer:

- broken repetition,
- path terminating,
- missing expected element,
- sudden negative space,
- visual cadence ending before expected destination.

Avoid:

- supernatural disappearance effect,
- depicting a massacre or destruction not supported by evidence,
- dramatic wreckage used as false certainty.

### 10.6 BRANCH

Required:

- two or more plausible continuations,
- divergence readable at large scale,
- no unsupported single route presented as fact.

Prefer:

- spatial fork,
- multiple depth axes,
- controlled value separation,
- unequal weighting only when evidence warrants it.

Avoid:

- modern map arrows by default,
- glowing selected route,
- final answer implied by composition.

### 10.7 ABSENCE

Required:

- the expected continuation is missing,
- residual trace remains sufficient to make absence legible.

Prefer:

- empty destination zone,
- interrupted pattern,
- abandoned relationship,
- scale contrast between trace and emptiness.

Avoid:

- empty landscape with no reason for emptiness,
- atmosphere standing in for narrative absence.

### 10.8 QUESTION

Required:

- unresolved continuation,
- viewer-facing narrative pull,
- open edge or incomplete destination.

Prefer:

- distance,
- partial visibility,
- competing directions,
- visual invitation beyond frame.

Avoid:

- heroic silhouette staring at sunset as a generic ending,
- visually definitive answer,
- static wallpaper finale.

---

## 11. Surface Grammar V1

KNF should not rely on photorealism for authority.

Preferred surface direction:

```text
STYLIZED NARRATIVE ILLUSTRATION
MATTE SURFACE
SIMPLIFIED SMALL-SCALE DETAIL
GRAPHICALLY READABLE MASSES
DIRECTIONAL SHAPE DESIGN
LAYER-FRIENDLY DEPTH
HISTORICALLY PLAUSIBLE STRUCTURE AT THE REQUIRED CONFIDENCE LEVEL
```

### 11.1 Rendering priority

```text
SILHOUETTE
> VALUE MASS
> DIRECTIONAL GEOMETRY
> SPATIAL RELATION
> MATERIAL SUGGESTION
> MICRODETAIL
```

### 11.2 Explicitly not required

- photographic skin,
- photographic metal,
- lens simulation,
- PBR materials,
- film-grain realism,
- cinema-still finish,
- ultra-detailed costume rendering.

### 11.3 Avoid convergence

Reject or regenerate if the output mainly reads as:

```text
GENERIC HISTORICAL CONCEPT ART
MOVIE STILL
GAME KEY ART
HERO POSTER
TOURISM LANDSCAPE
DIORAMA TOY SCENE
CHIBI / CUTE CHARACTER ART
```

The distinctive channel identity should come from temporal-spatial composition first.

---

## 12. Detail and factuality budget

Each frame must declare a `detailBudget`:

```text
LOW
MEDIUM
HIGH_EXCEPTION
```

### LOW

Default for:

- distant people,
- disputed events,
- uncertain routes,
- unknown outcomes,
- atmosphere-supporting objects,
- nonessential military / costume detail.

### MEDIUM

Allowed for:

- supported architecture class,
- supported material class,
- documented broad clothing / equipment logic,
- important recurring location identity.

### HIGH_EXCEPTION

Allowed only when both conditions are strong:

```text
HIGH NARRATIVE NECESSITY
AND
HIGH EVIDENCE CONFIDENCE
```

Examples may include authentic supplied evidence or a specific verified feature necessary to the story.

High detail must never be used simply to make the image look expensive.

---

## 13. Certainty-mode translation

### FACT

- clear directional relation,
- observational composition,
- supported structures / actions,
- no extra dramatic claim.

### RECONSTRUCTION

- kinetic action allowed,
- broad plausible detail,
- visibly illustrative treatment,
- avoid false documentary specificity.

### HYPOTHESIS

- branching,
- partial occlusion,
- distance,
- competing trajectories,
- reduced specificity.

### LEGEND

- stronger symbolic transformation allowed,
- still preserve directional story logic,
- clearly distinct from evidence-bearing visual mode.

### UNKNOWN

- broken trace,
- interrupted axis,
- unresolved exit,
- negative space,
- no invented destination or event.

---

## 14. Frame-to-frame handoff grammar

The most important sequence rule is:

> **The outgoing cue of frame N should become the incoming trace of frame N+1, either literally or by transformation.**

Allowed handoff transforms:

```text
CONTINUE
BEND
COMPRESS
EXPAND
BREAK
SPLIT
MERGE
DISSOLVE
REVEAL
REVERSE
```

Examples:

```text
road direction
→ corridor direction

marching formation rhythm
→ repeated columns

coastline
→ ink-like route curve

open doorway
→ distant valley gap

continuous road
→ broken record rhythm
```

This preserves momentum without requiring literal object continuity.

### 14.1 Minimum handoff contract

Every planned frame-to-frame link should carry at least two of:

```text
KINETIC_AXIS
DEPTH_AXIS
TRAVEL_DIRECTION
MOTION_CARRIER
VALUE MASS
LIGHT DIRECTION
ARCHITECTURAL RHYTHM
HANDOFF ANCHOR
OPEN EDGE
```

---

## 15. Image-to-video operational contract

The clip must amplify the still frame's existing motion architecture.

Each frame declares one primary `cameraMotion` and optional environmental motion.

### Preferred camera motions

```text
MEASURED_FORWARD_TRACK
MEASURED_LATERAL_TRACK
FOLLOW_PATH
REVEAL_THROUGH_OCCLUSION
DEPTH_PARALLAX
CONTROLLED_PULL_BACK
CONTROLLED_RISE_OR_DESCENT
STATIC_CAMERA_WITH_STRONG_ENVIRONMENTAL_FLOW
```

### Environmental motion

Examples:

- cloth continues along axis,
- grass bends through frame,
- fog drifts across depth,
- people continue their staggered movement,
- waves reinforce shoreline direction,
- light/shadow reveals next region.

### One primary motion rule

Do not stack several unrelated cinematic moves.

The clip should normally have:

```text
1 primary camera intention
+
0-2 supporting environmental motions
```

### Avoid by default

- generic push-in on every frame,
- random orbit,
- face zoom,
- object inspection turntable,
- drone dive without story function,
- crash zoom,
- motion that contradicts the still's kinetic axis.

---

## 16. Anti-linger operational rule

> **One visual focus should not outlive the narrative relation it serves.**

A new frame, internal reveal, reframing, or clip transition is required when the narration changes one of these relations:

```text
LOCATION
DIRECTION
EVIDENCE STATE
CERTAINTY
CAUSE / CONSEQUENCE
SUBJECT RELATION
PRESSURE
POSSIBILITY
QUESTION
```

Do not keep showing the same object or environment merely because the voice-over continues discussing the same general topic.

No fixed universal duration in seconds is defined.

Long-form may breathe, but breathing must preserve a living visual relation.

---

## 17. Prompt Compilation Grammar

The final provider prompt should remain compact.

Detailed design stays upstream in the Frame Design Card.

Compile in this order:

```text
1. STORY FUNCTION + CURRENT ACTION
2. SCALE + SPATIAL RELATION
3. TRACE / ACTION / EXIT STRUCTURE
4. KINETIC AXIS
5. 2-4 MOTION CARRIERS
6. OUTGOING CUE + OPEN EDGE
7. SURFACE TREATMENT
8. FACTUAL / CERTAINTY CONSTRAINTS
9. HANDOFF REQUIREMENT IF MATERIAL
10. NEGATIVE CONSTRAINTS
```

### 17.1 Prompt template

```text
[STORY FUNCTION]: [present action], with [incoming trace] showing what came before and [outgoing cue] pulling the eye toward what comes next.

[COMPOSITION]: [subject scale] subjects within [environment function], primary movement [kinetic axis]. Build the frame as connected trace, action, and exit fields rather than a centered tableau.

[MOTION CARRIERS]: [carrier 1], [carrier 2], optional [carrier 3].

[SURFACE]: stylized narrative illustration, matte, simplified small-scale detail, graphically readable masses, directional shape design, layer-friendly depth; not a photographic movie still.

[FACTUALITY]: [certainty mode + factual constraints].

[CONTINUATION]: preserve [handoff anchor / open edge] for the next beat.
```

### 17.2 Negative compilation defaults

Use when relevant:

```text
static centered tableau
hero poster
beauty portrait
object glamour shot
photographic hyperrealism
film-still finish
glossy game render
unnecessary costume microdetail
unsupported insignia or heraldry
readable generated historical text
closed composition
spectacle-only camera logic
```

Do not add every negative term mechanically if it makes the execution prompt unstable. The compiler should keep only materially relevant constraints.

---

## 18. Operational QC rubric

Score each category `0`, `1`, or `2`.

```text
0 = FAIL
1 = PARTIAL
2 = STRONG
```

### Categories

1. `STORY_MESSAGE_READABLE`
2. `T_MINUS_1_TRACE_READABLE`
3. `T0_ACTION_READABLE`
4. `T_PLUS_1_PULL_READABLE`
5. `KINETIC_AXIS_READABLE`
6. `NON_FIXATION`
7. `TEMPORAL_EDGE_FLOW`
8. `FACTUAL_RESTRAINT`
9. `I2V_DERIVABILITY`
10. `HANDOFF_USABILITY`

Maximum score: `20`.

### Candidate threshold

```text
PASS CANDIDATE >= 16 / 20
```

The numeric score does not override mandatory-fail conditions.

### Mandatory fail conditions

Any one of the following blocks promotion:

- no outgoing cue on a continuing beat,
- large centered hero subject without narrative justification,
- frame reads mainly as generic cinematic historical concept art,
- unsupported readable historical text,
- unsupported heraldry / insignia presented as fact,
- photoreal detail becomes the main appeal,
- artifact / object fixation replaces story flow,
- uncertainty is converted into visual certainty,
- clip motion would have to invent a new direction unrelated to the image,
- frame cannot hand off usable visual momentum to the next beat.

---

## 19. Sequence-level QC

Individual frame scores are not enough.

Evaluate a sequence for:

```text
BEAT VARIATION
SCALE VARIATION
AXIS VARIATION
DENSITY VARIATION
OPENNESS VARIATION
MOTION-CARRIER VARIATION
CERTAINTY-MODE FIT
HANDOFF CONTINUITY
ANTI-LINGER COMPLIANCE
CHANNEL DISTINCTIVENESS
```

### Repetition warnings

Flag the sequence if any of these occur without deliberate reason:

- three consecutive frames use the same shot scale,
- three consecutive frames use the same primary axis,
- three consecutive frames use fog / smoke / sunset as the main motion signal,
- repeated marching-landscape images differ only cosmetically,
- every clip relies on push-in,
- every frame uses a centered distant destination,
- evidence beats repeatedly become object close-ups.

---

## 20. Roman IX operational validation cards

These are validation designs only. They are not production approvals.

### KNF_SAMPLE_01 — MOVE

```text
storyMessage:
  A Roman force is already moving through a remote northern frontier; the destination remains unresolved.

narrativeBeatType:
  MOVE

certaintyMode:
  RECONSTRUCTION grounded by documented northern activity

timeEnvelope:
  T-1: receding travelled route / trailing formation behind
  T0: small formation crossing the frame in active progression
  T+1: route bends or disappears beyond the open edge

spatialFields:
  traceField: travelled road + diminishing figures
  actionField: moving formation at small scale
  exitField: open terrain and route continuing beyond view

kineticAxis:
  primary: NEAR_TO_FAR with a diagonal / curved path

motionCarriers:
  road perspective
  staggered formation rhythm
  wind in cloth / grass
  low weather flow across depth

openEdge:
  DEPTH or RIGHT depending on composition

subjectScale:
  SMALL

detailBudget:
  LOW

factualConstraints:
  no unsupported Ninth Legion emblem
  no exact route claim
  no readable generated text

avoidances:
  hero soldier foreground dominance
  parade formation
  photoreal armor showcase
```

### KNF_SAMPLE_02 — TRACE / REVEAL

```text
storyMessage:
  A documented trace of presence becomes visible inside the larger story space and redirects the investigation.

narrativeBeatType:
  REVEAL

certaintyMode:
  FACT for the existence of documented evidence; reconstruction for surrounding scene

timeEnvelope:
  T-1: movement or approach toward the evidence context
  T0: trace becomes readable as important evidence within the space
  T+1: visual direction shifts from the evidence toward the unanswered later fate

spatialFields:
  traceField: approach / prior movement
  actionField: evidence contextualized, not isolated
  exitField: route or space continuing beyond evidence

kineticAxis:
  CURVED_PATH or REVEAL_THROUGH_DEPTH

motionCarriers:
  approach geometry
  architectural repetition
  light / opening revealing the trace

subjectScale:
  SMALL_TO_MEDIUM for evidence context, not full-screen artifact

detailBudget:
  MEDIUM only for supported broad evidence form

factualConstraints:
  no invented readable inscription
  generated evidence must not look like authenticated source material

avoidances:
  product-shot stone slab
  readable fake Latin
  static museum display
```

### KNF_SAMPLE_03 — BREAK / ABSENCE

```text
storyMessage:
  The previously readable historical trail stops; the absence of continuation becomes the information.

narrativeBeatType:
  BREAK + ABSENCE

certaintyMode:
  UNKNOWN / INTERPRETATION

timeEnvelope:
  T-1: a readable narrative rhythm exists
  T0: that rhythm visibly ends or loses continuity
  T+1: no definitive destination replaces it

spatialFields:
  traceField: residual path / repeated markers / established rhythm
  actionField: interruption
  exitField: meaningful emptiness rather than a depicted disappearance event

kineticAxis:
  INTERRUPTED_AXIS

motionCarriers:
  broken repetition
  route ending or losing legibility
  large negative-space field

subjectScale:
  SMALL or NONE if the story reads more clearly without figures

detailBudget:
  LOW

factualConstraints:
  do not depict a confirmed annihilation
  do not depict supernatural disappearance
  do not assert a final battlefield

avoidances:
  bodies / battlefield wreckage as invented explanation
  soldiers fading into magic fog
  dramatic destruction used as certainty
```

### KNF_SAMPLE_04 — BRANCH / QUESTION

```text
storyMessage:
  Several plausible directions remain after the record gap, and none is visually declared the answer.

narrativeBeatType:
  BRANCH + QUESTION

certaintyMode:
  HYPOTHESIS / UNKNOWN

timeEnvelope:
  T-1: one known trail arrives from the previous beat
  T0: the story opens into multiple plausible continuations
  T+1: each continuation extends beyond the frame without resolution

spatialFields:
  traceField: single incoming relation
  actionField: controlled divergence
  exitField: multiple open continuations

kineticAxis:
  DIVERGING

motionCarriers:
  terrain / route divergence
  value-mass separation
  multiple depth corridors

subjectScale:
  SMALL or NONE

detailBudget:
  LOW

factualConstraints:
  no readable map labels
  no exact route line presented as fact
  no single destination highlighted as correct

avoidances:
  modern infographic map
  glowing chosen path
  heroic final answer pose
```

---

## 21. Validation sequence handoff plan

The four Roman IX validation frames should connect conceptually as:

```text
MOVE
road / formation direction
        ↓ CONTINUE

REVEAL
approach direction becomes evidence-context direction
        ↓ BREAK

BREAK / ABSENCE
known visual rhythm terminates
        ↓ SPLIT

BRANCH / QUESTION
missing continuation opens into competing directions
```

The sequence must not become four variations of "Romans walking through misty mountains."

Each frame has a different narrative function and therefore should use a different visual structure.

---

## 22. Pilot acceptance criteria

`TASK-KNF-01B` is operationally successful when the next visual pilot can prove all of the following:

1. The four frames look structurally different because their narrative beats differ.
2. Each still implies time without depending on literal animation.
3. The viewer can identify a dominant direction or interruption at a glance.
4. The sequence does not depend on photoreal historical reconstruction.
5. The frame surface remains channel-consistent while era-specific details stay subordinate.
6. The clips can derive motion from the images rather than inventing generic camera moves.
7. The sequence avoids long fixation on one person, artifact, place, or decorative environment.
8. Historical uncertainty remains visible where required.
9. The sequence feels more distinctive than generic history concept art.
10. The next-beat pull survives from frame to frame.

---

## 23. Implementation boundary

This task intentionally does not yet:

- change `HISTORY_MYSTERY_VISUAL_BIBLE`,
- create a new canonical resource version,
- change WF-09 Scene Asset schema,
- add KNF fields to `project.db`,
- change provider prompt transport,
- regenerate Roman IX production assets,
- approve any KNF sample as production media,
- delete or overwrite the previous Style Anchor experiment.

Those changes require visual validation first.

---

## 24. Next task

After this grammar is accepted, the next task should be:

`TASK-KNF-02 — Kinetic Narrative Frame Visual Pilot V2`

It should generate exactly the four Roman IX validation frames from Section 20 using this operational grammar, then score each frame with Section 18 and the sequence with Section 19.

The goal is not to produce final Roman IX artwork.

The goal is to determine whether the operational grammar produces a visually distinctive, story-first, motion-implying channel language before any canonical or runtime integration occurs.
