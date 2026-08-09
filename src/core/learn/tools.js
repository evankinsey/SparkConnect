// ─── TOOLS ───────────────────────────────────────────────────────────────────
// The Learn tab becomes Tools, and learning moves inside the tool it belongs to.
//
// Nobody opens an app to "learn". They open it to bend a pipe, and THEN want to
// know why the shrink is what it is. A standalone Learn tab competes with the
// tools for the same tap instead of serving them, and the content inside it is
// invisible to the person who needed it thirty seconds ago while holding a
// bender.
//
// So each tool grows the same three sections:
//
//   LESSONS   why it works
//   DO IT     the tool itself — the calculator, the simulator, the camera
//   PRACTICE  prove you have it
//
// Nothing here duplicates the card catalog. Tools are DERIVED from HOME_CARDS,
// which means a feature cannot exist in one place and not the other, and adding
// a tool is still a single row in one file.
//
// Pure module: no React, no storage.

import { HOME_CARDS, CardKind, allTools } from '../home/layout.js';
import { TRACKS } from './curriculum.js';

export const Section = Object.freeze({
  LESSONS: 'LESSONS',
  DO: 'DO',
  PRACTICE: 'PRACTICE',
});

export const SECTION_LABEL = Object.freeze({
  LESSONS: 'Lessons',
  DO: 'Do it',
  PRACTICE: 'Practice',
});

/**
 * Per-tool section wiring. A tool with no entry here is still listed — it just
 * opens straight to itself, which is the honest rendering of "this one has no
 * lessons yet". Inventing a Lessons tab that opens an empty screen is worse
 * than not having one.
 *
 * `tab` values must exist in App.js VALID_TABS; a test enforces it.
 */
export const TOOL_SECTIONS = Object.freeze({
  bend: {
    DO: { tab: 'bend', label: 'Bender' },
    LESSONS: { tab: 'formulas', label: 'Bending math', note: 'Shrink, gain, and why the multiplier is what it is' },
    PRACTICE: { tab: 'examprep', label: 'Bending questions', category: 'Conduit' },
  },
  wiring_lab: {
    DO: { tab: 'wiringlab', label: 'Simulation' },
    LESSONS: { tab: 'wiringlab', label: 'Guided mode', note: 'One conductor at a time, with the reason for each' },
    PRACTICE: { tab: 'troubleshoot', label: 'Challenges', note: 'Find the fault in a circuit that is already wrong' },
  },
  troubleshoot: {
    DO: { tab: 'troubleshoot', label: 'Scenarios' },
    LESSONS: { tab: 'wiringlab', label: 'Learn the circuit first', note: 'You cannot find a fault in a circuit you cannot draw' },
    PRACTICE: { tab: 'troubleshoot', label: 'More scenarios' },
  },
  volt: {
    DO: { tab: 'volt', label: 'Calculator' },
    LESSONS: { tab: 'formulas', label: 'Voltage drop', note: 'Where the 3% comes from and why it is a note, not a rule' },
    PRACTICE: { tab: 'examprep', label: 'Voltage drop questions', category: 'Voltage Drop' },
  },
  boxfill: {
    DO: { tab: 'boxfill', label: 'Calculator' },
    LESSONS: { tab: 'formulas', label: 'Box fill', note: 'What counts, what does not, and why' },
    PRACTICE: { tab: 'examprep', label: 'Box fill questions', category: 'Box Fill' },
  },
  conduitfill: {
    DO: { tab: 'conduitfill', label: 'Calculator' },
    LESSONS: { tab: 'formulas', label: 'Conduit fill', note: 'Percent of the TOTAL area — Chapter 9, Tables 1, 4 and 5' },
    PRACTICE: { tab: 'examprep', label: 'Conduit fill questions', category: 'Conduit Fill' },
  },
  ampacity: {
    DO: { tab: 'ampacity', label: 'Calculator' },
    LESSONS: { tab: 'formulas', label: 'Ampacity and derating', note: 'Temperature correction, conductor count, termination ratings' },
    PRACTICE: { tab: 'examprep', label: 'Ampacity questions', category: 'Ampacity' },
  },
  spark_ai: {
    DO: { tab: 'necai', label: 'Ask' },
    LESSONS: { tab: 'necai', label: 'Saved answers', note: 'Answers you kept' },
    PRACTICE: { tab: 'examprep', label: 'Test yourself instead' },
  },
  flashcards: {
    DO: { tab: 'flashcards', label: 'Study' },
    PRACTICE: { tab: 'examprep', label: 'Code Quiz' },
  },
  examprep: {
    DO: { tab: 'examprep', label: 'Take the quiz' },
    LESSONS: { tab: 'flashcards', label: 'Drill the weak areas first' },
  },
  jobsite: {
    DO: { tab: 'jobsite', label: 'Walk the site' },
    LESSONS: { tab: 'wiringlab', label: 'Learn the circuits you will be asked to wire' },
  },
  blueprint: {
    DO: { tab: 'blueprint', label: 'Take off a sheet' },
    LESSONS: { tab: 'necai', label: 'Ask about a symbol' },
  },
  wire: { DO: { tab: 'wire', label: 'Colour reference' } },
  formulas: { DO: { tab: 'formulas', label: 'Formulas' } },
  calculators: { DO: { tab: 'calculators', label: 'All calculators' } },
  projects: { DO: { tab: 'projects', label: 'Your jobs' } },
  jobcam: { DO: { tab: 'projects', label: 'Photos, inside a project' } },
  estimator: { DO: { tab: 'estimator', label: 'Estimate' } },
  permits: { DO: { tab: 'permits', label: 'Permit assistant' } },
  contractor_connect: { DO: { tab: 'contractors', label: 'Contractor Connect' } },
  panelschedule: { DO: { tab: 'panelschedule', label: 'Panel schedule' } },
  materials: { DO: { tab: 'materials', label: 'Material list' } },
  community: { DO: { tab: 'community', label: 'Community' } },
  learn: { DO: { tab: 'learn', label: 'Study paths' } },
});

/**
 * A tool, with whatever sections it actually has.
 * Derived from the card catalog, so there is exactly one list of features.
 */
export const toolFor = (card) => {
  const wiring = TOOL_SECTIONS[card.id] ?? {};
  const sections = [Section.LESSONS, Section.DO, Section.PRACTICE]
    .filter((s) => wiring[s])
    .map((s) => Object.freeze({
      section: s,
      label: wiring[s].label ?? SECTION_LABEL[s],
      sectionLabel: SECTION_LABEL[s],
      tab: wiring[s].tab,
      note: wiring[s].note ?? null,
      category: wiring[s].category ?? null,
    }));

  return Object.freeze({
    id: card.id,
    title: card.title,
    sub: card.sub,
    icon: card.icon,
    group: card.group,
    // Where a plain tap goes: the DO section if there is one, else the card's
    // own tab. A tool always opens to the thing it is, never to a menu.
    tab: wiring[Section.DO]?.tab ?? card.tab,
    sections,
    hasLessons: sections.some((s) => s.section === Section.LESSONS),
    hasPractice: sections.some((s) => s.section === Section.PRACTICE),
  });
};

/** Every tool, in the Home catalog's order. */
export const TOOLS = () => allTools().map(toolFor);

/** Grouped for the Tools tab, groups in catalog order. */
export const toolsGrouped = () => {
  const groups = new Map();
  for (const t of TOOLS()) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group).push(t);
  }
  return [...groups.entries()].map(([group, tools]) => ({ group, tools }));
};

export const toolById = (id) => TOOLS().find((t) => t.id === id) ?? null;

/**
 * Which tool does a curriculum track live under now?
 *
 * The re-parenting rule the spec asks for: no orphaned lesson. Every AVAILABLE
 * track has to resolve to a tool, and a test asserts it. Unavailable tracks are
 * roadmap entries with no destination yet and are exempt — they are honest
 * about not being built, which is different from being lost.
 */
export const parentToolForTrack = (track) => {
  if (!track?.tab) return null;
  return TOOLS().find((t) => t.tab === track.tab || t.sections.some((s) => s.tab === track.tab)) ?? null;
};

/** Tracks that would be unreachable after the move. Must always be empty. */
export const orphanedTracks = () =>
  TRACKS.filter((t) => t.available && !parentToolForTrack(t));

/** Study paths that belong under a given tool, for its Lessons section. */
export const tracksForTool = (toolId) => {
  const tool = toolById(toolId);
  if (!tool) return [];
  return TRACKS.filter((t) => t.available && parentToolForTrack(t)?.id === tool.id);
};

export { Section as ToolSection, CardKind, HOME_CARDS };
