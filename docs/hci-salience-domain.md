# The salience domain — the realm of implementable HCI features in an agentic substrate

> Status: domain study (2026-09-19). A companion to `app-v2-vision.md` §5.13, which names the nodes of a team's platform. This document names the human-facing feature realm those nodes can implement, organized by what each feature does to attention. It is a design lens, not a clinical model; where it borrows the language of attention regulation it does so as an observation about how people actually work, and it claims nothing about anyone's diagnosis.

## 0. The claim, and how to read this

Every feature a human-facing agentic system can implement is an operation on salience: it changes what is in the foreground of a person's attention, when, at what cost, on whose authority, with what evidence, and with what ability to say no. That is the whole realm. Search, notifications, dashboards, reminders, memory, journaling prompts, approval gates, task lists, focus modes, digests, check-ins, receipts: each is a configuration of the same small set of substrate primitives along the same small set of dimensions. Once the dimensions and the primitives are named, the realm is enumerable, and the structural complexity of the "multi-configurable command substrate" turns out to be the product of a short list of families and a short list of dimensions, with a few constraints that separate an honest feature from a hijack.

The organizing observation is the one you made: a great deal of difficulty in getting the right things done is not a lack of capability but misaligned salience, a flattening in which everything pulls with roughly the same weight and the unimportant sits on top of the important. Practices that bring a person back to themselves, journaling, contemplation, a walk, a conversation with someone who knows them, re-install right-sized salience, after which deliberate action becomes easy rather than heroic. The familiar attention "hacks" are small, local versions of the same re-installation. A system that serves a person well is one whose features do that re-installation honestly and on demand, and never does the opposite.

The mirror is the second half of the claim. An agent has a salience field too: its context window. Everything in the list above has an agent-side twin (tool search is triage, the playbook is a focus mode, a system reminder is an interrupt, a memory file is recall, a receipt is closure), and the substrate primitives that implement the human-facing feature are the same ones that implement the agent-facing one. That is why one substrate can be configured for two kinds of mind, and why a design that is dishonest about attention on one side tends to be dishonest on the other.

Read §1 for the dimensions, §2 for the primitives, §3 for the eighteen families (the realm itself), §4 for the mirror, §5 for the constraints that keep a feature honest, §6 for the pathologies, §7 for measurement, and §8 for what this changes in the platform.

## 1. The dimensions of a salience act

A salience act is one change to what a person attends to. Seven dimensions describe any such act; a feature is a point or a small region in this space.

| Dimension | Values | The question it answers |
|---|---|---|
| **direction** | surface · suppress · defer · delegate · close | is this coming toward the foreground, going away from it, moving in time, moving to another mind, or leaving with a receipt |
| **timing** | now (interrupt) · at a moment (scheduled) · on a trigger (event) · on request (pull) · ambient (always on, low intensity) | when does the change happen, and who chose the moment |
| **channel** | message · chat turn · ambient view · document · voice · spatial · haptic · a comment in a system of record (ADO, a pull request) · for the agent: system prompt, tool result, memory file | through what modality, and therefore at what cost |
| **authority** | self-set · a rule the person set earlier (a hook, a schedule) · the agent's judgment · another person · a system alarm | who decided this deserved attention |
| **cost** | none (glance) · low (a line) · medium (a read) · high (an interrupt with recovery time) | what the act takes from the person's attention, including the cost of returning to what they were doing |
| **consent** | opt-in · opt-out · dismissable · snoozable · non-dismissable (rare and named) | can the person say no, and does the system learn from the no |
| **evidence** | a receipt · a deadline · a pattern in history · a rule · an inference · nothing | what the claim "this matters now" rests on |

Two derived properties matter everywhere. **Honesty** is whether the act's weight matches its evidence: an interrupt backed by nothing is a lie about importance. **Recovery** is the cost of returning after the act; interrupts are expensive because recovery is, not because the message is long.

## 2. The substrate primitives

Everything in §3 is built from eight primitives. Naming them is what makes the realm enumerable: a feature is a configuration of these along the dimensions in §1.

| Primitive | What it is | Human-facing example | Agent-facing twin |
|---|---|---|---|
| **verb** | a named, typed operation with a receipt (an MCP tool, a CLI command) | "remember this", "what's next", "publish" | the tool the agent calls |
| **trigger** | an event that fires a verb (a hook) | when a pull request goes red, tell me | PostToolUse, Stop, a webhook |
| **schedule** | a clock that fires a verb | a check-in at three, a weekly review on Friday | a routine, a loop, a wake-up |
| **channel** | a delivery path with a cost profile | Teams, an ADO comment, a status line, a morning brief | a system reminder, a tool result, a notification queue |
| **memory** | state that persists across sessions, with provenance | a knowledge base, a personal journal, a decision log | a memory directory, a catalog, a transcript |
| **policy** | who may do what, and whether to ask | allow, ask, deny; quiet hours; who may interrupt | permissions, tool visibility, approval gates |
| **receipt** | an append-only record of what happened, with evidence | "done, here is the run", "you decided X on Tuesday" | every tool call written down |
| **view** | a rendering of state at a chosen cost | a badge, a one-line status, a page, a document | the printed matrix, the frontier list |

A feature = one or more verbs, wired to triggers and schedules, delivered through channels, reading and writing memory, governed by policy, producing receipts, rendered as views. That sentence is the entire architecture of the substrate, and each of its nouns is one of the eight.

## 3. The families — the realm itself

Eighteen families cover the realm. Each has a salience function, the everyday practice it formalizes, its substrate implementation, the failure mode that turns it into noise or a hijack, and its honest measure. The families are not disjoint; a good feature often belongs to two (a morning brief is ambient awareness plus reflection plus triage). They are complete in the sense that a proposed feature which fits none of them is either not about attention or is a manipulation.

### 3.1 Capture

**Function.** Get a thing out of the head and into a place that will hold it, so the head can let go. Direction: defer, with a promise of later surfacing.
**Practice.** Write it down. The brain dump. The inbox.
**Substrate.** A `remember` verb on a knowledge base or personal memory node; a `raise` verb for anything that needs a human; the recording of sessions and the receipts of tools, which are capture that happens without being asked.
**Failure.** Capture without triage becomes another pile that itself demands attention. A capture verb that does not route to a triage family has made things worse.
**Measure.** Items captured that were later surfaced or closed, over items captured. The rest is hoarding.

### 3.2 Triage

**Function.** Assign right-sized weight. Decide what matters now, what matters later, and what does not matter. Direction: surface a few, suppress or defer the rest.
**Practice.** The one thing. The frog. The three for today. Importance against urgency.
**Substrate.** A `next` verb that computes the frontier from receipts, deadlines, and declared missions; ranking in a results or delivery node; a digest that orders rather than lists.
**Failure.** False precision: a score with three decimals on a judgment with none. And substitution: the system's ranking quietly replaces the person's own sense of what matters, which is misaligned salience with better typography.
**Measure.** Whether the top item was acted on; how often the person overrode the order, and whether the override was later vindicated.

### 3.3 Foregrounding

**Function.** Make one thing large and everything else small. Direction: surface one, suppress the rest, for a bounded time.
**Practice.** Focus mode. One tab. A clean desk. The single sheet of paper.
**Substrate.** A session scoped to one mission with only that mission's tools visible; a view that shows the one open handoff and nothing else; for the agent, tool search and deferred loading are exactly this.
**Failure.** Tunnel vision that hides the interrupt that actually mattered. Foregrounding needs an escalation path for the rare non-dismissable act.
**Measure.** Time-in-focus before the first self-interruption; work completed per focus block.

### 3.4 Time-shifting

**Function.** Move salience to a chosen later moment. Direction: defer with a return ticket.
**Practice.** Timers. Alarms. "Remind me at three." Implementation intentions: when X happens, I will do Y.
**Substrate.** Schedules (a routine, a `send_later`), triggers (hooks that fire on an event), a reminder verb with an owner and an expiry. The implementation intention is literally a hook: an event and a bound action.
**Failure.** Reminder fatigue and snooze death: the fourth snooze has taught the person that the reminder is noise. A reminder without an expiry is a permanent low-grade interrupt.
**Measure.** Reminders acted on at first delivery; median snoozes before action; reminders that expired unacted.

### 3.5 Ambient awareness

**Function.** Keep a small set of facts in the periphery at near-zero cost, so they never need an interrupt. Direction: surface, at glance cost, always.
**Practice.** The wall calendar. The whiteboard. The badge on the icon. The weather.
**Substrate.** A status line; a badge; a one-line view of the results node; the printed capability matrix; a morning brief that is read once and sets the day's field.
**Failure.** Theater: an ambient display that is beautiful and says nothing, or that says things the person cannot act on. v1's three-dimensional dashboard is the canonical case, an ambient view of a loop that had no agent in it. Ambient signals earn their place only by being glanceable and honest.
**Measure.** Glances that led to an action, over glances; facts on the display that changed a decision in the last month, over facts on the display.

### 3.6 Interrupts and their governance

**Function.** Bring something to the foreground now, at high cost, because it cannot wait. Direction: surface, timing now.
**Practice.** The phone call. The tap on the shoulder. The alarm.
**Substrate.** A notification channel with severity; a policy over who and what may interrupt (a person, a red build, a handoff) and when (quiet hours); batching into digests for everything below the line; an escalation ladder from ambient to digest to interrupt.
**Failure.** Everything is urgent, so nothing is; the person stops trusting the channel and mutes it, and the one real interrupt is lost with the rest.
**Measure.** Interrupts per day; the fraction the person judged worth the cost after the fact; time to mute.

### 3.7 Recall

**Function.** Bring a past salient thing back at the moment it is relevant. Direction: surface from memory, on request or on trigger.
**Practice.** "What did I decide about this?" "What did I promise them?" The index card. The search.
**Substrate.** A `recall` verb over memory with provenance, so the answer says when and why; recall triggered by context (opening a screen surfaces its facets; opening a ticket surfaces its history).
**Failure.** Stale recall presented as current; confident recall of something never decided. Recall without provenance cannot be trusted and therefore cannot be used.
**Measure.** Recalls acted on; recalls corrected by the person; age of recalled facts at the time of use.

### 3.8 Context restoration

**Function.** Rebuild the working set after a break, which is the most expensive moment in attention-heavy work and the one most often lost. Direction: surface a bundle, on request, at re-entry.
**Practice.** The note to self on the desk before leaving. "Where was I?" The handoff email.
**Substrate.** A resume packet computed from receipts: what was being done, what is open, what was decided, what is next; session transcripts and handoff memos; for the agent, compaction summaries and the orientation document a fresh session reads.
**Failure.** The stale handoff: a document that describes a state the system left months ago, so re-entry begins with a lie. This repository's own orientation file, which for months said the code lived in a folder that had been deleted, is the case study.
**Measure.** Time from re-entry to first productive action; corrections the person had to make to the packet.

### 3.9 Reflection

**Function.** Recalibrate salience itself. Step back from the field and ask what actually matters, what has been avoided, what the pulls have been. Direction: re-weight everything, on a schedule or on request.
**Practice.** Journaling. Contemplation. The weekly review. The retrospective. The walk. This is the family that "brings you back to yourself"; the others adjust the field, this one adjusts the person's relationship to the field.
**Substrate.** A scheduled reflection session whose prompts are computed from receipts rather than generic: what was deferred three times; what was captured and never triaged; what took longer than it was worth; what got done without being on any list. A personal memory node that holds the answers with a privacy boundary no other node crosses.
**Failure.** Reflection as avoidance: analysis in place of the action it was meant to enable. The tell is reflection that produces documents rather than changes. And the second pile: a journal that becomes one more thing demanding attention.
**Measure.** The reflection-to-action ratio: the fraction of reflection sessions that produced a concrete change in what was done the following week. If it is low, the practice has become the pathology.

### 3.10 Commitment

**Function.** Make the deliberate choice easier to keep than to break, by adding friction to the wrong path and removing it from the right one. Direction: shape the field in advance.
**Practice.** Pre-commitment. The rule made when calm for the moment of weakness. Putting the guitar on the stand and the phone in the drawer. WIP limits.
**Substrate.** Policy: allow, ask, deny. Gates that block "done" until a condition holds (a receipt from a real system before a merge). Defaults that make the right path one step and the wrong path three. A pull-request template line that asks for the predicted effect before the change.
**Failure.** Friction everywhere, which produces workaround culture and learned helplessness; and commitment devices set by someone else, which are just rules.
**Measure.** Commitments kept; gates bypassed; the number of steps on the desired path versus the undesired one.

### 3.11 Decomposition

**Function.** Turn a mountain into a step, because a mountain has no salience gradient and a step does. Direction: surface the smallest next thing.
**Practice.** "What's the smallest next thing?" The two-minute rule. The checklist.
**Substrate.** Plan mode; task lists; the frontier operator that names the cheapest cell whose prerequisites hold; skills that end by naming the next action rather than the whole plan.
**Failure.** Decomposition as procrastination: the plan becomes the work. Sixty thousand lines of planning for a system that had never shipped a test is decomposition without a first step taken. The tell is a plan that is longer than the code it describes.
**Measure.** Steps taken over steps planned; the age of the oldest planned-but-untaken step.

### 3.12 Closure

**Function.** Remove a thing from the field with evidence that it is done, so it stops pulling. Direction: close, with a receipt.
**Practice.** Crossing it off. Shipping. The done pile. Telling someone.
**Substrate.** Receipts on every verb; publishing results to the system of record so the closure is visible where others look; archiving and retiring as first-class verbs; the small honest celebration in a channel.
**Failure.** False closure: green that means nothing (a test that ran in dry-run mode; a probe that asserted its own fixture). False closure is worse than no closure because it removes the pull from something that is not done.
**Measure.** Closures with evidence over closures; reopen rate.

### 3.13 Boundaries

**Function.** Decide what is not in the field at all. Direction: suppress, by design, with consent.
**Practice.** Quiet hours. "Not now." The closed door. Not owning the thing.
**Substrate.** Tool visibility and deferred loading; allowlists; do-not-disturb windows in policy; the personal memory boundary; held-out routes reserved so the system cannot grade itself.
**Failure.** Suppression that hides the important; boundaries set by the system rather than the person.
**Measure.** Things that crossed a boundary and should not have; things that were kept out and later turned out to matter.

### 3.14 Presence

**Function.** Change the field by having another mind in the room. Direction: surface through relationship rather than information.
**Practice.** Body doubling. Pairing. The check-in call. Someone asking "how is it going?" at the right moment.
**Substrate.** An interactive session with an agent that holds the thread; a scheduled check-in that asks one question; a loop that returns at a chosen cadence; a human reviewer who did not build the thing.
**Failure.** The sycophant and the nag: presence that only affirms, or presence that only prods. Both are absences wearing a face.
**Measure.** Sessions with presence that ended in an action; the person's own report of whether the presence helped.

### 3.15 Meaning

**Function.** Attach the why to the what, because salience runs on meaning and a task without its reason has no weight of its own. Direction: surface the telos chain.
**Practice.** Remembering who it is for. The story of the quarter. The reason the work matters.
**Substrate.** The chain from receipt to capability to mission to outcome, made visible at the point of action; a weekly narrative computed from receipts rather than composed for a slide.
**Failure.** Narrative in place of change; meaning-making as sanctuary from the plain act.
**Measure.** Whether people can say why the current task matters without looking; whether the narrative predicted what actually got done.

### 3.16 Variety

**Function.** Use novelty as fuel without letting it steer. Direction: rotate the field.
**Practice.** Changing rooms. Alternating kinds of work. Following the rabbit, briefly and on purpose.
**Substrate.** Choosing the next frontier cell by interest as well as cost; side quests with a time box; a mode that surfaces something different when the field has gone flat.
**Failure.** Novelty-chasing: the new plan, the new tool, the new document, each fresh and none finished. The realm's most expensive failure in agent-built systems, because an agent will happily write the new plan.
**Measure.** Started over finished, by kind of thing.

### 3.17 State awareness

**Function.** Fit the field to the person's capacity now: time of day, energy, what kind of day it is. Direction: scale everything.
**Practice.** Not today. The morning for hard things. Knowing one is depleted.
**Substrate.** Profiles and modes the person sets (quiet, focus, admin); effort levels for the agent; a personal memory that remembers what kinds of days go which way.
**Failure.** Surveillance: inferring state from behavior and acting on it without consent. State is declared, never deduced.
**Measure.** Modes used; whether a declared state changed what the system did.

### 3.18 Trust

**Function.** The cross-cutting family: every salience act carries its authority and its evidence, can be declined, explains itself, and learns from being declined. Direction: all of them.
**Practice.** A friend who tells you why, and stops when you ask.
**Substrate.** Receipts on every act; a dismiss verb whose receipt feeds the next triage; explanations attached to every interrupt and reminder; policy the person can read.
**Failure.** Manipulation: an act whose weight exceeds its evidence, or that cannot be declined. Manipulation is the boundary of the realm; features past it are not HCI, they are capture of a different kind.
**Measure.** Dismissals; acts the person later judged manipulative; whether dismissals changed subsequent behavior.

## 4. The mirror: the agent's field

Every family in §3 has a twin on the agent's side, implemented by the same primitive, because an agent's context window is a salience field with a hard budget.

| Family | Agent-side twin | Primitive |
|---|---|---|
| capture | tool results written to memory or receipts instead of held in context | receipt, memory |
| triage | tool search and deferred loading; the frontier list | verb, view |
| foregrounding | the playbook; a session scoped to one mission with one tool set | policy, view |
| time-shifting | hooks on tool use and on stop; scheduled routines and wake-ups | trigger, schedule |
| ambient awareness | the status line; the one-line summary of earlier steps kept in context | view |
| interrupts | system reminders; notifications from watched resources | channel |
| recall | memory files; the catalog; the orientation document | memory |
| context restoration | compaction summaries; handoff memos; the resume packet a fresh session reads | memory, view |
| reflection | evals; the retrospective the agent writes; the receipt-computed "what did I defer" | schedule, receipt |
| commitment | permissions; approval gates; the reality budget on every pull request | policy |
| decomposition | plan mode; task lists; the smallest next thing | verb |
| closure | the receipt on every tool call; publish; archive | receipt |
| boundaries | tool visibility; allowlists; held-out routes the agent may not touch | policy |
| presence | the human in the loop; a reviewer who did not build it | channel |
| meaning | the telos chain from receipt to outcome, stated in the playbook | view |
| variety | choosing the next cell by interest, within a time box | verb |
| state awareness | effort levels; budgets per task | policy |
| trust | provenance on every write; receipts the human can read | receipt |

The consequence for design is that the substrate is configured, not built, per mind. A hook that reminds a person at three and a hook that reminds an agent after every tool call are the same primitive with a different channel and cost. A policy that keeps a person out of their inbox during focus hours and a policy that hides forty tools from an agent are the same primitive with a different subject. This is the "multi-configurable" property stated precisely: one substrate, eight primitives, two subjects, eighteen families, seven dimensions.

## 5. Constraints that keep a feature honest

These are the laws of the realm. A feature that violates one is either broken or manipulative.

1. **Weight matches evidence.** The cost an act imposes may not exceed what its evidence supports. An interrupt needs a receipt, a deadline, or a person; a pattern earns a digest line; an inference earns an ambient hint.
2. **Every act names its authority.** The person can always see who decided this deserved attention, and can revoke a rule they set.
3. **Every act can be declined, and the decline is a receipt.** A dismissal that teaches nothing is noise with a button. The rare non-dismissable act is named in policy in advance, not decided in the moment.
4. **Capture routes to triage.** A capture verb that does not end in a weight assignment is a pile.
5. **Time-shifted acts have an owner and an expiry.** A reminder that can snooze forever is a permanent low-grade interrupt.
6. **Ambient views are glanceable and actionable.** If a fact on the display has not changed a decision in a month, it comes off.
7. **Closure requires evidence.** Green means a receipt from a real system, never a mode that skipped the work.
8. **Reflection produces change or stops.** A reflection practice whose reflection-to-action ratio stays low is suspended, not intensified.
9. **State is declared, never deduced.** No inference about a person's capacity or mood acts without their say.
10. **The plan is shorter than the step.** Decomposition that is longer than the code or the action it describes is procrastination and is treated as such.

## 6. Pathologies: misaligned salience in systems

Systems have salience fields too, and they misalign in the same ways people do. The families' failure modes, read together, are the catalog of system-level misaligned salience, and this repository's own history supplies an example of most of them.

| Pathology | The family it corrupts | What it looks like in a system | The re-alignment move |
|---|---|---|---|
| theater | ambient awareness | a dashboard of a loop with no agent in it; a scene with a camera | show only what changed a decision |
| noise | interrupts, time-shifting | every reminder urgent; the channel muted | severity with evidence; digests below the line |
| hoarding | capture | logs, ledgers, and corpora nobody reads | capture routes to triage or is deleted |
| false closure | closure | a green test that ran in dry-run; a probe that asserted its own fixture; a verdict on a synthetic app | closure needs a receipt from a real system |
| self-grading | boundaries, trust | the held-out site used to drive the fix | reserve what the system may not touch |
| the plan as the work | decomposition | sixty thousand lines of plans; steps marked landed with no artifact | the plan is shorter than the step; landed means an artifact exists |
| novelty-chasing | variety | the new plan document, the new track, each fresh, none finished | started over finished, by kind |
| analysis as sanctuary | reflection, meaning | theorem groups and adjunctions before contact; narrative instead of change | reflection-to-action ratio; contact first |
| stale re-entry | context restoration | an orientation document describing a tree that no longer exists | the packet is computed from receipts, not maintained by hand |
| substitution of judgment | triage | the system's ranking replaces the person's sense of what matters | overrides are receipts that reshape the ranking |

The re-alignment moves for a system are the same as for a person: contact with what is actually so (a real screen, a real reviewer), a receipt for what happened, a return to the smallest next thing, and a practice of asking what was avoided. The reality study and the cold-start journal in this repository were the system journaling. They worked for the same reason journaling works.

## 7. Measurement

Each family has its measure in §3; the realm as a whole has four that a platform can compute from receipts without asking anyone to fill in a form.

| Measure | Definition | What it detects |
|---|---|---|
| **acted-on rate** | acts of surfacing (interrupts, reminders, digest lines, ambient facts) that led to an action, over acts | noise, theater |
| **re-entry time** | time from resuming a mission to the first productive receipt | stale context restoration |
| **closure with evidence** | closures backed by a real-system receipt, over closures | false closure |
| **reflection-to-action** | reflection sessions followed by a change in the next week's receipts, over sessions | analysis as sanctuary |

A fifth, the **override rate** on triage, is worth watching but not optimizing: a person who never overrides the system's ranking has stopped exercising judgment, and one who always overrides it is not being helped.

## 8. What this changes in the platform

Read against `app-v2-vision.md` §5.13, the salience lens reclassifies several nodes and adds design rules to all of them.

- **The handoff node is an interrupt-governance node.** Its contract is severity, authority, evidence, and a dismiss that is a receipt. Without those four fields it is a notification pipe, and it will be muted within a month.
- **The results node and the delivery-health node are ambient views.** They are judged by rule 6: a fact stays on the display only while it changes decisions.
- **The personal memory node is the reflection substrate.** Its prompts are computed from receipts (deferred three times; captured and never triaged; started and not finished) and it holds the answers behind a boundary no other node crosses.
- **The morning brief is a triage act with a digest channel.** It orders; it does not list. Its measure is whether the top item was acted on.
- **The scheduled routines are time-shifting acts** and inherit rule 5: every routine has an owner and an expiry, and one that fires unacted three times asks whether it should exist.
- **Policy is the commitment family** and should be written when calm: the reality budget, the reviewer who did not build it, the held-out reserve, and quiet hours are all pre-commitments, and they belong in a file the person can read.
- **Tesseract itself is mostly closure and recall.** Its receipts close loops in the system of record, and its catalog is recall with provenance. Its handoffs are its one interrupt, and they carry the four fields.
- **Every node's `decide` cell in the seven-verb matrix is where this document lands.** A node that can surface things to a person must implement dismiss-as-receipt, authority, and evidence, or it has a `decide` cell of maturity one.

And one rule for the platform as a whole, which is also the rule for this document: a taxonomy of attention is itself a salience act. It earns its place by producing at least one feature that was built differently because of it, within a month. If it does not, it goes in the archive with the theorem groups, and that is not a failure of the taxonomy but a correct closure.
