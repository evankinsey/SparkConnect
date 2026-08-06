// ─── VOICE ───────────────────────────────────────────────────────────────────
// Voice is UI, not a second intelligence.
//
// The failure mode this file prevents is subtle and common: a voice feature
// gets built as its own path — its own prompt, its own handling, its own idea
// of what is allowed — and the guardrails that took months to build on the
// typed path silently do not apply. Six months later somebody discovers you can
// ask by voice what the app refuses to answer by keyboard.
//
// So there is no answering logic here at all. This module turns audio into a
// question string and hands it to the same `ask()` every typed question goes
// through: same classifier, same risk bands, same router, same evidence
// contract, same refusals.
//
// What IS here is the part that is genuinely voice-specific: transcription is
// lossy, and a misheard number in an electrical question is dangerous in a way
// a misheard word in a chat app is not.
//
// Pure module: no React, no network. Transcription is injected.

import { ask } from './sparkai.js';
import { refuse } from './answer.js';

/** Below this, we ask the user to repeat rather than guess at what they said. */
export const TRANSCRIPT_CONFIDENCE_FLOOR = 0.6;

/**
 * Homophones and mishearings that change an electrical answer.
 *
 * "Forty" and "fourteen" are one vowel apart and three sizes apart. This does
 * not silently correct them — correcting a number the user did not say is
 * exactly the danger. It flags the ambiguity so the UI can confirm.
 */
const RISKY_HOMOPHONES = [
  [/\bfor(?:ty)?\s*teen\b|\bfourteen\b/i, ['fourteen', 'forty']],
  [/\bfifty\b/i, ['fifty', 'fifteen']],
  [/\bfifteen\b/i, ['fifteen', 'fifty']],
  [/\bsixty\b/i, ['sixty', 'sixteen']],
  [/\bsixteen\b/i, ['sixteen', 'sixty']],
  [/\bthirty\b/i, ['thirty', 'thirteen']],
  [/\bthirteen\b/i, ['thirteen', 'thirty']],
  [/\bten\b/i, ['ten', 'two']],
  [/\btwo\b/i, ['two', 'ten']],
];

/** Spoken forms the extractors do not read. "twelve gauge" → "12 gauge". */
const NUMBER_WORDS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, eighteen: 18, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, hundred: 100,
});

/**
 * Normalise a transcript into something the parameter extractors can read.
 * Deliberately conservative: it rewrites number WORDS and spoken units, and
 * touches nothing else.
 */
export const normalizeTranscript = (text) => {
  let s = String(text ?? '').trim();
  if (!s) return '';

  // "number twelve" / "num 12" → "#12"
  s = s.replace(/\bnumber\s+(\w+)\b/gi, (m, w) => {
    const n = NUMBER_WORDS[w.toLowerCase()] ?? (/^\d+$/.test(w) ? Number(w) : null);
    return n ? `#${n}` : m;
  });

  // Bare number words followed by a unit the extractors know.
  s = s.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|eighteen|twenty|thirty|forty|fifty|sixty|hundred)\s+(gauge|awg|amp|amps|volt|volts|feet|foot|conductors?|wires?)\b/gi,
    (m, w, unit) => `${NUMBER_WORDS[w.toLowerCase()]} ${unit}`,
  );

  // Spoken fractions for trade sizes.
  s = s.replace(/\bhalf\s+inch\b/gi, '1/2"')
    .replace(/\bthree\s+quarter(?:s)?(?:\s+inch)?\b/gi, '3/4"')
    .replace(/\bone\s+(?:and\s+)?(?:a\s+)?quarter(?:\s+inch)?\b/gi, '1-1/4"');

  // "a w g" / "ay double you gee" style spellouts.
  s = s.replace(/\ba\.?\s*w\.?\s*g\.?\b/gi, 'AWG');

  return s.replace(/\s+/g, ' ').trim();
};

/** Numbers whose mishearing would change the answer. */
export const ambiguousNumbers = (text) => {
  const s = String(text ?? '');
  const out = [];
  for (const [re, options] of RISKY_HOMOPHONES) {
    const m = s.match(re);
    if (m) out.push(Object.freeze({ heard: m[0], couldBe: Object.freeze(options) }));
  }
  return out;
};

/**
 * Ask by voice.
 *
 * Everything after normalisation is the typed path, unchanged. The only voice
 * additions are ahead of it: refuse an empty or low-confidence transcript, and
 * attach any number ambiguity so the UI can confirm before acting.
 */
export const askByVoice = async (transcript, options = {}) => {
  const { transcriptConfidence = 1 } = options;
  const raw = String(transcript ?? '').trim();

  if (!raw) {
    return Object.freeze({
      ...refuse('I did not catch that.', { suggestion: 'Try again, a little closer to the mic.' }),
      voice: Object.freeze({ transcript: '', normalized: '', ambiguous: [] }),
    });
  }

  if (Number.isFinite(Number(transcriptConfidence)) && Number(transcriptConfidence) < TRANSCRIPT_CONFIDENCE_FLOOR) {
    return Object.freeze({
      ...refuse('I am not confident I heard that correctly.', {
        suggestion: `I heard "${raw}". Say it again, or type it — a misheard number changes the answer.`,
      }),
      voice: Object.freeze({ transcript: raw, normalized: '', ambiguous: [], lowConfidence: true }),
    });
  }

  const normalized = normalizeTranscript(raw);
  // Checked against the RAW transcript, not the normalised one. Normalisation
  // rewrites "fifteen" to "15", which is exactly the word whose mishearing we
  // are trying to catch — checking afterwards found nothing, every time.
  const ambiguous = ambiguousNumbers(raw);

  // Same pipeline as typing. No separate prompt, no separate rules.
  const result = await ask(normalized, options);

  return Object.freeze({
    ...result,
    voice: Object.freeze({
      transcript: raw,
      normalized,
      ambiguous: Object.freeze(ambiguous),
      // The UI must confirm before the user acts on a number that could have
      // been misheard. Never silently corrected — correcting a number somebody
      // did not say is the danger, not the fix.
      needsConfirmation: ambiguous.length > 0,
    }),
  });
};
