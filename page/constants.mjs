// page/constants.mjs — the kernels' own constants, in the words the page's prose uses them. index.html carries each one as
// <span data-k="name">fallback</span>; page/app.mjs writes these values over the fallbacks as the page loads, and
// test/page.test.mjs checks every fallback equals its value here, so the prose cannot drift from the code it describes.
import { BAR, HOUR, MIN_WINDOWS, N_MIN } from '../src/regulator.mjs';
import { LEASE, SILENT, PAUSE_WINDOW, MAX_PAUSES } from '../src/mesh.mjs';
import { VERBS } from '../src/envelope.mjs';
import { CAP, MAX_AGE, PROMOTE, MAX_BYTES } from '../src/daylog.mjs';
import { SLICE_MS } from '../src/idle.mjs';
import { MIN_N, MIN_LATER, SLICE } from '../src/memory.mjs';
import { BATCH } from '../src/inherit.mjs';
import { SHARE, MIN_ACTIONS, MAX_ACTIONS } from '../src/yours.mjs';

const n = (x) => x.toLocaleString('en-GB');
export const K = Object.freeze({
  fitShare: `${Math.round(SHARE * 100)}%`, heldShare: `${Math.round((1 - SHARE) * 100)}%`,
  verbs: n(VERBS.length), pausesMax: n(MAX_PAUSES), pauseWindowH: n(PAUSE_WINDOW / HOUR), leaseH: n(LEASE / HOUR), silentH: n(SILENT / HOUR),
  throttleBar: String(BAR.throttle), minWindows: n(MIN_WINDOWS), nMin: n(N_MIN),
  logCap: n(CAP), logAge: n(MAX_AGE), promote: n(PROMOTE), logBytes: n(MAX_BYTES), sliceMs: n(SLICE_MS),
  slice: n(SLICE), minN: n(MIN_N), minLater: n(MIN_LATER), batch: n(BATCH),
  minActions: n(MIN_ACTIONS), maxActions: n(MAX_ACTIONS),
});
