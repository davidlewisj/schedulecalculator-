/**
 * Pure business logic extracted from index.html.
 * These functions contain no DOM dependencies and are fully unit-testable.
 */

/**
 * The provider database keyed by location slug.
 * Each provider has an id, name, role, and default slot count.
 * (1 slot = 10 minutes on the AMD schedule)
 */
const database = {
  bellevue: [
    { id: 'bel_1', name: 'Dr. E Smith', role: 'Provider', default: 44 },
    { id: 'bel_2', name: 'Dr. Bains',   role: 'Provider', default: 88 },
    { id: 'bel_3', name: 'Dr. Mara',    role: 'Provider', default: 44 },
  ],
  silverdale: [
    { id: 'sil_1', name: 'Dr. Kushner',   role: 'Provider',  default: 44 },
    { id: 'sil_2', name: 'Dr. Kwolek',    role: 'Provider',  default: 44 },
    { id: 'sil_3', name: 'Dr. Lamberton', role: 'Provider',  default: 44 },
    { id: 'sil_4', name: 'Nancy',         role: 'Assistant', default: 48 },
    { id: 'sil_5', name: 'Gabby',         role: 'Assistant', default: 48 },
    { id: 'sil_6', name: 'Victoria',      role: 'Assistant', default: 48 },
  ],
  federalway: [
    { id: 'fed_1', name: 'Dr. Mara',  role: 'Provider', default: 66 },
    { id: 'fed_2', name: 'Dr. Bains', role: 'Provider', default: 88 },
  ],
  sleepmedicine: [
    { id: 'sleep_1', name: 'Dr. Jacobs', role: 'Provider', default: 35 },
    { id: 'sleep_2', name: 'Rachel',     role: 'Provider', default: 40 },
    { id: 'sleep_3', name: 'Dr. Smith',  role: 'Provider', default: 60 },
  ],
};

/** Maximum number of days a single provider can be scheduled per week. */
const MAX_DAYS_PER_WEEK = 4;

/**
 * Compute schedule utilization.
 *
 * @param {number} total     - Total slots scheduled across all providers.
 * @param {number|string} unfilledRaw - Raw value from the "unfilled spots" input.
 *   An empty string is treated as 0 (assume all slots were filled).
 * @returns {{ pct: number, filled: number } | null}
 *   Returns null when total is 0 (nothing scheduled yet).
 *   pct is capped at 100 even when unfilled is negative (over-delivered).
 */
function calculateUtilization(total, unfilledRaw) {
  if (total === 0) return null;
  const unfilled = unfilledRaw === '' ? 0 : parseFloat(unfilledRaw);
  const filled = total - unfilled;
  let pct = (filled / total) * 100;
  if (pct > 100) pct = 100;
  return { pct, filled };
}

/**
 * Determine the colour state for the "unfilled spots" input based on the
 * current values, mirroring the logic in `updateUnfilledStyle()`.
 *
 * @param {string|number} rawVal - Raw value of the unfilled input field.
 * @param {number} total         - Total scheduled slots.
 * @returns {'positive'|'neutral'|'warning-low'|'warning-medium'|'warning-high'}
 */
function getUnfilledColorState(rawVal, total) {
  const val = parseInt(rawVal);

  // Negative unfilled means over-delivery → green
  if (val < 0) return 'positive';

  // Empty or zero: no colour signal yet
  if (rawVal === '' || val === 0) return 'neutral';

  // Cannot compute a meaningful ratio without providers on the schedule
  if (total === 0) return 'neutral';

  const filled = total - val;
  const pct = (filled / total) * 100;

  // >90 % filled → light red (minor gap)
  if (pct > 90) return 'warning-low';
  // 80–90 % filled → medium red
  if (pct >= 80) return 'warning-medium';
  // <80 % filled → dark red (large gap)
  return 'warning-high';
}

/**
 * Adjust an integer input value by the given amount.
 * Non-numeric or missing values are treated as 0.
 *
 * @param {string|number} currentValue
 * @param {number} amount - Positive to increment, negative to decrement.
 * @returns {number}
 */
function adjustNumberValue(currentValue, amount) {
  const val = parseInt(currentValue) || 0;
  return val + amount;
}

/**
 * Sum the slot counts for all providers currently shown in a schedule zone.
 *
 * @param {number[]} spotValues - Array of raw numeric slot values (NaN-safe).
 * @returns {number}
 */
function sumSpots(spotValues) {
  return spotValues.reduce((sum, v) => {
    const n = parseInt(v);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

/**
 * Determine whether a provider can be added to another day in week view.
 *
 * @param {object} providerUsage - Map of provider id → days used this week.
 * @param {string} providerId
 * @returns {boolean}
 */
function canAddProviderToDay(providerUsage, providerId) {
  return (providerUsage[providerId] || 0) < MAX_DAYS_PER_WEEK;
}

/**
 * Return updated usage after adding a provider to a day.
 * Throws if the max has already been reached.
 *
 * @param {object} providerUsage
 * @param {string} providerId
 * @returns {object} New usage object (does not mutate the original).
 */
function addProviderToDay(providerUsage, providerId) {
  if (!canAddProviderToDay(providerUsage, providerId)) {
    throw new Error(`Max ${MAX_DAYS_PER_WEEK} days reached for provider ${providerId}`);
  }
  return { ...providerUsage, [providerId]: (providerUsage[providerId] || 0) + 1 };
}

/**
 * Return updated usage after removing a provider from a day.
 * Usage will not go below 0.
 *
 * @param {object} providerUsage
 * @param {string} providerId
 * @returns {object} New usage object (does not mutate the original).
 */
function removeProviderFromDay(providerUsage, providerId) {
  const current = providerUsage[providerId] || 0;
  return { ...providerUsage, [providerId]: Math.max(0, current - 1) };
}

/**
 * Look up a provider by base id within a location's provider list.
 *
 * @param {string} location - Location slug (e.g. 'bellevue').
 * @param {string} baseId   - Provider id (e.g. 'bel_1').
 * @returns {object|undefined}
 */
function findProvider(location, baseId) {
  const providers = database[location] || [];
  return providers.find(p => p.id === baseId);
}

/**
 * Return the default slot count for a provider, or 0 if not found.
 *
 * @param {string} location
 * @param {string} baseId
 * @returns {number}
 */
function getProviderDefaultSlots(location, baseId) {
  const provider = findProvider(location, baseId);
  return provider ? provider.default : 0;
}

module.exports = {
  database,
  MAX_DAYS_PER_WEEK,
  calculateUtilization,
  getUnfilledColorState,
  adjustNumberValue,
  sumSpots,
  canAddProviderToDay,
  addProviderToDay,
  removeProviderFromDay,
  findProvider,
  getProviderDefaultSlots,
};
