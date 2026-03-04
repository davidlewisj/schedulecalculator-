/**
 * Unit tests for the pure business logic in src/calculator.js.
 *
 * These tests cover the highest-risk areas identified during the coverage
 * analysis: utilization calculation, unfilled-spot colour logic, slot
 * arithmetic, provider usage tracking, and the provider database.
 */

const {
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
} = require('../src/calculator');

// ---------------------------------------------------------------------------
// calculateUtilization
// ---------------------------------------------------------------------------
describe('calculateUtilization', () => {
  test('returns null when total is 0 (nothing scheduled)', () => {
    expect(calculateUtilization(0, 0)).toBeNull();
    expect(calculateUtilization(0, '')).toBeNull();
  });

  test('calculates full utilization when unfilled is 0', () => {
    const result = calculateUtilization(100, 0);
    expect(result.pct).toBe(100);
    expect(result.filled).toBe(100);
  });

  test('treats empty-string unfilled as 0 (all slots filled)', () => {
    const result = calculateUtilization(80, '');
    expect(result.pct).toBe(100);
    expect(result.filled).toBe(80);
  });

  test('calculates partial utilization correctly', () => {
    const result = calculateUtilization(100, 25);
    expect(result.pct).toBeCloseTo(75);
    expect(result.filled).toBe(75);
  });

  test('caps percentage at 100 when unfilled is negative (over-delivery)', () => {
    // Negative unfilled means more filled than scheduled — should cap at 100 %
    const result = calculateUtilization(100, -10);
    expect(result.pct).toBe(100);
    expect(result.filled).toBe(110);
  });

  test('handles all slots being unfilled (0 % utilization)', () => {
    const result = calculateUtilization(50, 50);
    expect(result.pct).toBe(0);
    expect(result.filled).toBe(0);
  });

  test('handles realistic provider slot counts', () => {
    // Bellevue: Dr. Bains (88) + Dr. Mara (44) = 132 total, 10 unfilled
    const result = calculateUtilization(132, 10);
    expect(result.pct).toBeCloseTo(92.42, 1);
    expect(result.filled).toBe(122);
  });

  test('decimal unfilled values are handled correctly', () => {
    const result = calculateUtilization(200, 33);
    expect(result.pct).toBeCloseTo(83.5, 1);
  });
});

// ---------------------------------------------------------------------------
// getUnfilledColorState
// ---------------------------------------------------------------------------
describe('getUnfilledColorState', () => {
  test('returns "positive" for negative values (over-delivery)', () => {
    expect(getUnfilledColorState(-1, 100)).toBe('positive');
    expect(getUnfilledColorState(-50, 100)).toBe('positive');
  });

  test('returns "neutral" for empty string input', () => {
    expect(getUnfilledColorState('', 100)).toBe('neutral');
  });

  test('returns "neutral" when unfilled is 0', () => {
    expect(getUnfilledColorState(0, 100)).toBe('neutral');
    expect(getUnfilledColorState('0', 100)).toBe('neutral');
  });

  test('returns "neutral" when total is 0 (no providers scheduled)', () => {
    expect(getUnfilledColorState(5, 0)).toBe('neutral');
  });

  test('returns "warning-low" when >90 % of slots are filled', () => {
    // 91 filled / 100 total → 91 % filled, 9 unfilled
    expect(getUnfilledColorState(9, 100)).toBe('warning-low');
    // Boundary: exactly 91 filled
    expect(getUnfilledColorState(9, 100)).toBe('warning-low');
  });

  test('returns "warning-medium" when 80–90 % of slots are filled', () => {
    // 85 filled / 100 total → 85 % filled, 15 unfilled
    expect(getUnfilledColorState(15, 100)).toBe('warning-medium');
    // Boundary: exactly 80 % filled
    expect(getUnfilledColorState(20, 100)).toBe('warning-medium');
    // Boundary: exactly 90 % filled
    expect(getUnfilledColorState(10, 100)).toBe('warning-medium');
  });

  test('returns "warning-high" when <80 % of slots are filled', () => {
    // 79 filled / 100 total → 79 % filled, 21 unfilled
    expect(getUnfilledColorState(21, 100)).toBe('warning-high');
    // Half full
    expect(getUnfilledColorState(50, 100)).toBe('warning-high');
  });

  test('handles non-round numbers correctly', () => {
    // 132 total, 20 unfilled → 112 filled = 84.8 % → warning-medium
    expect(getUnfilledColorState(20, 132)).toBe('warning-medium');
  });
});

// ---------------------------------------------------------------------------
// adjustNumberValue
// ---------------------------------------------------------------------------
describe('adjustNumberValue', () => {
  test('increments a valid integer', () => {
    expect(adjustNumberValue(5, 1)).toBe(6);
  });

  test('decrements a valid integer', () => {
    expect(adjustNumberValue(5, -1)).toBe(4);
  });

  test('treats NaN / empty input as 0', () => {
    expect(adjustNumberValue('', 1)).toBe(1);
    expect(adjustNumberValue('abc', -1)).toBe(-1);
    expect(adjustNumberValue(undefined, 5)).toBe(5);
  });

  test('handles large adjustments', () => {
    expect(adjustNumberValue(44, 10)).toBe(54);
    expect(adjustNumberValue(88, -88)).toBe(0);
  });

  test('result can go negative', () => {
    expect(adjustNumberValue(0, -1)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// sumSpots
// ---------------------------------------------------------------------------
describe('sumSpots', () => {
  test('returns 0 for an empty array', () => {
    expect(sumSpots([])).toBe(0);
  });

  test('sums valid integer values', () => {
    expect(sumSpots([44, 88, 44])).toBe(176);
  });

  test('ignores NaN entries', () => {
    expect(sumSpots([44, NaN, 88])).toBe(132);
  });

  test('ignores non-numeric string entries', () => {
    expect(sumSpots([44, 'abc', 88])).toBe(132);
  });

  test('handles string numbers correctly', () => {
    expect(sumSpots(['44', '88'])).toBe(132);
  });

  test('matches realistic week view totals', () => {
    // Silverdale providers: 44+44+44+48+48+48 = 276
    const defaults = database.silverdale.map(p => p.default);
    expect(sumSpots(defaults)).toBe(276);
  });
});

// ---------------------------------------------------------------------------
// Provider usage tracking — canAddProviderToDay / addProviderToDay / removeProviderFromDay
// ---------------------------------------------------------------------------
describe('canAddProviderToDay', () => {
  test('returns true when provider has not been added yet', () => {
    expect(canAddProviderToDay({}, 'bel_1')).toBe(true);
  });

  test('returns true when usage is below the maximum', () => {
    expect(canAddProviderToDay({ bel_1: 3 }, 'bel_1')).toBe(true);
  });

  test('returns false when usage equals MAX_DAYS_PER_WEEK (4)', () => {
    expect(canAddProviderToDay({ bel_1: 4 }, 'bel_1')).toBe(false);
  });

  test('does not affect other providers in the usage map', () => {
    const usage = { bel_1: 4, bel_2: 1 };
    expect(canAddProviderToDay(usage, 'bel_2')).toBe(true);
  });
});

describe('addProviderToDay', () => {
  test('initialises usage to 1 for a new provider', () => {
    const result = addProviderToDay({}, 'bel_1');
    expect(result.bel_1).toBe(1);
  });

  test('increments existing usage', () => {
    const result = addProviderToDay({ bel_1: 2 }, 'bel_1');
    expect(result.bel_1).toBe(3);
  });

  test('throws when attempting to exceed MAX_DAYS_PER_WEEK', () => {
    expect(() => addProviderToDay({ bel_1: 4 }, 'bel_1')).toThrow();
  });

  test('does not mutate the original usage object', () => {
    const original = { bel_1: 2 };
    addProviderToDay(original, 'bel_1');
    expect(original.bel_1).toBe(2);
  });

  test('preserves usage counts for other providers', () => {
    const result = addProviderToDay({ bel_1: 1, bel_2: 3 }, 'bel_1');
    expect(result.bel_2).toBe(3);
  });
});

describe('removeProviderFromDay', () => {
  test('decrements existing usage', () => {
    const result = removeProviderFromDay({ bel_1: 3 }, 'bel_1');
    expect(result.bel_1).toBe(2);
  });

  test('does not go below 0', () => {
    const result = removeProviderFromDay({ bel_1: 0 }, 'bel_1');
    expect(result.bel_1).toBe(0);
  });

  test('handles missing provider gracefully (treats as 0)', () => {
    const result = removeProviderFromDay({}, 'bel_1');
    expect(result.bel_1).toBe(0);
  });

  test('does not mutate the original usage object', () => {
    const original = { bel_1: 2 };
    removeProviderFromDay(original, 'bel_1');
    expect(original.bel_1).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Provider database
// ---------------------------------------------------------------------------
describe('database integrity', () => {
  const locations = ['bellevue', 'silverdale', 'federalway', 'sleepmedicine'];

  test('all expected locations are present', () => {
    locations.forEach(loc => {
      expect(database[loc]).toBeDefined();
    });
  });

  test('every provider has required fields', () => {
    locations.forEach(loc => {
      database[loc].forEach(p => {
        expect(p.id).toBeTruthy();
        expect(p.name).toBeTruthy();
        expect(p.role).toBeTruthy();
        expect(typeof p.default).toBe('number');
        expect(p.default).toBeGreaterThan(0);
      });
    });
  });

  test('provider ids are unique across all locations', () => {
    const allIds = locations.flatMap(loc => database[loc].map(p => p.id));
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  test('location counts match expected roster sizes', () => {
    expect(database.bellevue).toHaveLength(3);
    expect(database.silverdale).toHaveLength(6);
    expect(database.federalway).toHaveLength(2);
    expect(database.sleepmedicine).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// findProvider / getProviderDefaultSlots
// ---------------------------------------------------------------------------
describe('findProvider', () => {
  test('finds an existing provider by id', () => {
    const p = findProvider('bellevue', 'bel_1');
    expect(p).toBeDefined();
    expect(p.name).toBe('Dr. E Smith');
  });

  test('returns undefined for an unknown id', () => {
    expect(findProvider('bellevue', 'zzz_99')).toBeUndefined();
  });

  test('returns undefined for an unknown location', () => {
    expect(findProvider('atlantis', 'bel_1')).toBeUndefined();
  });
});

describe('getProviderDefaultSlots', () => {
  test('returns the correct default for a known provider', () => {
    expect(getProviderDefaultSlots('bellevue', 'bel_2')).toBe(88);
    expect(getProviderDefaultSlots('sleepmedicine', 'sleep_1')).toBe(35);
  });

  test('returns 0 for an unknown provider', () => {
    expect(getProviderDefaultSlots('bellevue', 'zzz_99')).toBe(0);
  });

  test('returns 0 for an unknown location', () => {
    expect(getProviderDefaultSlots('atlantis', 'bel_1')).toBe(0);
  });
});
