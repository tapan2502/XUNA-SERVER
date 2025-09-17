// src/services/flatPricing.js
// Flat per-second pricing helper (ESM)

export const DEFAULT_USD_PER_SECOND = parseFloat(
  process.env.CALL_USD_PER_SECOND || "0.10" // 10 cents/sec
);
export const MIN_BILLABLE_SECONDS = parseInt(
  process.env.CALL_MIN_BILLABLE_SECONDS || "0", // set >0 if you want a minimum
  10
);

// Round to cents
function roundUSD(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {Object} params
 * @param {number|string} params.seconds - duration in seconds
 * @param {number} [params.userRate] - optional user-specific USD/sec override
 */
export function calcFlatPrice({ seconds, userRate }) {
  const secs = Math.max(MIN_BILLABLE_SECONDS, Math.max(0, Number(seconds) || 0));
  const perSecondUsd =
    typeof userRate === "number" && userRate > 0
      ? userRate
      : DEFAULT_USD_PER_SECOND;

  const costUsd = roundUSD(secs * perSecondUsd);

  return {
    secs,                 // billable seconds
    perSecondUsd,         // USD/sec used
    costUsd,              // total USD
    breakdown: {
      source: "flat_per_second",
      durationSecs: secs,
      usdPerSecond: perSecondUsd,
    },
  };
}
