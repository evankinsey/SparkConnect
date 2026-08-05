// ─── JOBSITE CAST ────────────────────────────────────────────────────────────
// The crew from the SparkConnect series, standing on the job site handing out
// the work. Each station has a character who briefs it in their own voice —
// the same voice they have in the videos, so the app and the series are
// recognisably the same world.
//
// Pure data on purpose: NO image requires live here. Bundlers turn a PNG
// require into an asset reference, which makes this module unimportable from a
// plain node test. The image map lives beside the screen instead
// (src/screens/castImages.js), and a test asserts the two agree.

export const CHARACTERS = Object.freeze({
  michael: {
    id: 'michael',
    name: 'Michael',
    role: 'Lead Apprentice',
    blurb: 'Green but eager. Asks questions. Growing every day.',
    accent: '#3B82F6',
  },
  jerry: {
    id: 'jerry',
    name: 'Jerry',
    role: 'Foreman',
    blurb: 'Impatient at times, but he wants the crew to be their best.',
    accent: '#DC2626',
  },
  miguel: {
    id: 'miguel',
    name: 'Miguel',
    role: 'Veteran Journeyman',
    blurb: 'Knowledgeable. Thorough teacher. Calm. Trusted mentor.',
    accent: '#F4A11D',
  },
  dante: {
    id: 'dante',
    name: 'Dante',
    role: 'Helper / Apprentice',
    blurb: 'Lively and charismatic. Brings energy to the crew.',
    accent: '#A855F7',
  },
  owner: {
    id: 'owner',
    name: 'The Owner',
    role: 'Owner / Project Manager',
    blurb: 'Confident, under control. Leads with vision. Delivers results.',
    accent: '#0EA5E9',
  },
  renee: {
    id: 'renee',
    name: 'Renee',
    role: 'GC Superintendent',
    blurb: 'Organized. Reliable. Keeps the job moving and the team safe.',
    accent: '#16A34A',
  },
});

export const CAST_IDS = Object.keys(CHARACTERS);

export const characterById = (id) => CHARACTERS[id] ?? null;

/**
 * What the character says when you walk up, and what they say when you finish.
 * Written in each character's voice from the cast sheet — Dante says "twin",
 * Jerry holds the line, Miguel teaches, Renee thinks about inspection.
 */
export const STATION_DIALOGUE = Object.freeze({
  'st-bedroom': {
    character: 'michael',
    brief: "Feed's at the switch on this one. Want to take it? I'll watch — I'm still getting this one down myself.",
    done: 'That worked. I need to run that one a few more times myself.',
  },
  'st-kitchen': {
    character: 'dante',
    brief: "Ay twin — supply lands at the light on this one, not the switch. Don't let it trick you.",
    done: "That's it, twin. Clean work.",
  },
  'st-living': {
    character: 'miguel',
    brief: 'Two doorways, one light. Take your time with the travelers. The common is the screw that matters.',
    done: 'Good. You found the common. That is the whole lesson.',
  },
  'st-bath': {
    character: 'renee',
    brief: 'This one gets inspected. Supply lands at the fixture. I need it right the first time.',
    done: 'Clean. That will pass.',
  },
  'st-hall': {
    character: 'jerry',
    brief: "Three switches, one hall light. Four-way goes in the middle. Don't tell me it's done until it works from every position.",
    done: 'Works from all three. That is how it should have been done the first time.',
  },
  'st-garage': {
    character: 'miguel',
    brief: "Customer says a light is acting up. Don't guess. Read the symptom, then go find it.",
    done: 'That is the fault. Diagnosis before parts, every time.',
  },
  'st-bench': {
    character: 'miguel',
    brief: 'Run has a beam in the way. Work your offset marks out before you cut anything.',
    done: 'Measure twice. You only get one cut.',
  },
  'st-truck': {
    character: 'owner',
    brief: 'Client is paying for documentation. Get the rough-in photographed before it gets closed up.',
    done: 'That is what keeps us out of arguments later. Good.',
  },
});

export const dialogueFor = (stationId) => STATION_DIALOGUE[stationId] ?? null;

export const characterForStation = (stationId) => {
  const d = STATION_DIALOGUE[stationId];
  return d ? CHARACTERS[d.character] : null;
};
