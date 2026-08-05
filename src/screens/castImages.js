// ─── CAST PORTRAITS ──────────────────────────────────────────────────────────
// Kept out of src/core/game/cast.js on purpose: a PNG require is a bundler
// asset reference, and putting one in the core module would make it
// unimportable from a plain node test. Keys must match CAST_IDS — tests assert
// exactly that, so a renamed character can never silently lose its face.

export const CAST_IMAGES = {
  michael: require('../../assets/cast/michael.png'),
  jerry: require('../../assets/cast/jerry.png'),
  miguel: require('../../assets/cast/miguel.png'),
  dante: require('../../assets/cast/dante.png'),
  owner: require('../../assets/cast/owner.png'),
  renee: require('../../assets/cast/renee.png'),
};

export const portraitFor = (characterId) => CAST_IMAGES[characterId] ?? null;
