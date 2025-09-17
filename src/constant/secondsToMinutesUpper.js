/**
 * Convert seconds to billable minutes (ceil/upper).
 * 0s → 0m, 1–60s → 1m, 61–120s → 2m, etc.
 *
 * @param {number} callDurationSecs - Duration in seconds.
 * @param {{cap?: number, minCharge?: boolean}} [opts] - Options.
 *   cap: upper limit in minutes (e.g., remaining plan minutes)
 *   minCharge: if true (default), minimum charge is 1 minute for any non-zero call
 * @returns {number} billable minutes
 */
// export function secondsToMinutesUpper(callDurationSecs, opts = {}) {
//   const secs = Math.max(0, Math.floor(callDurationSecs || 0));
//   if (secs === 0) return 0;

//   let mins = Math.ceil(secs / 60);

//   const minCharge = opts.minCharge ?? true;
//   if (minCharge) mins = Math.max(1, mins);

//   if (typeof opts.cap === "number") mins = Math.min(mins, Math.max(0, opts.cap));

//   return mins;
// }

export function secondsToMinutesUpper(callDurationSecs, opts = {}) {
  const secs = Math.max(0, Math.floor(callDurationSecs || 0));
  if (secs === 0) return 0;

  let mins = Math.ceil(secs / 60);
  const minCharge = opts.minCharge ?? true;
  if (minCharge) mins = Math.max(1, mins);
  if (typeof opts.cap === "number") mins = Math.min(mins, Math.max(0, opts.cap));
  return mins;
}

// Optional: nice display helper (mm:ss)
function secondsToMmSs(s) {
  const secs = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(secs / 60);
  const r = secs % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// Example usage:
// console.log(secondsToMinutesUpper(61));            // 2
// console.log(secondsToMinutesUpper(181 )); // 2
// console.log(secondsToMmSs(181));                   // "3:01"

// Exports (pick one)
// module.exports = { secondsToMinutesUpper, secondsToMmSs }; // CommonJS
// export { secondsToMinutesUpper, secondsToMmSs };           // ESM
