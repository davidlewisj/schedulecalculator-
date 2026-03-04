/**
 * DOM integration tests for the Staffing Planner.
 *
 * The application is a single HTML file whose inline <script> uses top-level
 * `let` declarations for `state` and `providerUsage`.  Because `let` does NOT
 * attach to the `window` object (unlike `var`), we can only interact with the
 * app through its public function API (function declarations ARE on `window`).
 *
 * Each test suite calls `window.switchView('today')` in `beforeEach` to reset
 * the app to a clean, predictable state; switchView() already clears the
 * lineup, resets providerUsage, and hides the result box.
 *
 * Coverage targets:
 *  - calculate()       – result box, utilisation text, filled/total detail
 *  - setNoStaff()      – "Office Closed" state
 *  - switchView()      – today ↔ week toggle and associated DOM mutations
 *  - adjustNumber()    – increment / decrement via UI controls
 *  - updateTotalSpots()– summing scheduled provider slots
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// One-time setup: stub canvas, mount app
// ---------------------------------------------------------------------------

// jsdom does not implement HTMLCanvasElement.getContext; stub it so the
// top-level `canvas.getContext("2d")` line in index.html doesn't throw.
const canvasStub = {
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  fillStyle: '',
};
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: () => canvasStub,
  configurable: true,
});

beforeAll(() => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'index.html'),
    'utf8'
  );
  document.open();
  document.write(html);
  document.close();
  window.init();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Insert a provider chip directly into the #lineup zone with a fixed slot
 * count, simulating a completed drag-and-drop.
 * Returns the input element's id.
 */
function addChipToLineup(spots = 44, chipId = 'test_chip') {
  const lineup = document.getElementById('lineup');
  const inputId = `spots_active_${chipId}`;
  const chip = document.createElement('div');
  chip.className = 'provider-chip';
  chip.id = chipId;
  chip.innerHTML = `
    <div class="chip-details">
      <span class="chip-name">Dr. Test</span>
      <span class="chip-role">Provider</span>
    </div>
    <div>
      <input type="number" id="${inputId}"
             class="modern-input spots-input" value="${spots}">
    </div>
  `;
  lineup.appendChild(chip);
  window.updateTotalSpots();
  return inputId;
}

// ---------------------------------------------------------------------------
// calculate()
// ---------------------------------------------------------------------------
describe('calculate()', () => {
  beforeEach(() => { window.switchView('today'); });

  test('alerts and leaves result box hidden when nothing is scheduled', () => {
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    window.calculate();
    expect(alertSpy).toHaveBeenCalledWith('Drag providers to the schedule first.');
    expect(document.getElementById('resultBox').style.display).toBe('none');
    alertSpy.mockRestore();
  });

  test('shows the result box after a valid calculation', () => {
    addChipToLineup(100, 'c1');
    document.getElementById('unfilledSpots').value = '10';
    window.calculate();
    expect(document.getElementById('resultBox').style.display).toBe('block');
  });

  test('displays the correct utilisation percentage', () => {
    addChipToLineup(100, 'c2');
    document.getElementById('unfilledSpots').value = '25';
    window.calculate();
    expect(document.getElementById('utilizationPct').innerText).toBe('75.0%');
  });

  test('displays the correct filled / total detail line', () => {
    addChipToLineup(100, 'c3');
    document.getElementById('unfilledSpots').value = '25';
    window.calculate();
    expect(document.getElementById('spotsDetail').innerText).toBe('75 filled / 100 total slots');
  });

  test('treats an empty unfilled input as 0 (shows 100 %)', () => {
    addChipToLineup(80, 'c4');
    document.getElementById('unfilledSpots').value = '';
    window.calculate();
    expect(document.getElementById('utilizationPct').innerText).toBe('100.0%');
  });

  test('caps the displayed percentage at 100 % when unfilled is negative', () => {
    addChipToLineup(100, 'c5');
    document.getElementById('unfilledSpots').value = '-5';
    window.calculate();
    expect(document.getElementById('utilizationPct').innerText).toBe('100.0%');
  });

  test('shows 0 % when all slots are unfilled', () => {
    addChipToLineup(100, 'c6');
    document.getElementById('unfilledSpots').value = '100';
    window.calculate();
    expect(document.getElementById('utilizationPct').innerText).toBe('0.0%');
  });
});

// ---------------------------------------------------------------------------
// setNoStaff()
// ---------------------------------------------------------------------------
describe('setNoStaff()', () => {
  beforeEach(() => { window.switchView('today'); });

  test('shows result box with "100%" and "Office Closed"', () => {
    window.setNoStaff();
    expect(document.getElementById('resultBox').style.display).toBe('block');
    expect(document.getElementById('utilizationPct').innerText).toBe('100%');
    expect(document.getElementById('spotsDetail').innerText).toBe('Office Closed');
  });

  test('hides the calculation input area', () => {
    window.setNoStaff();
    expect(document.getElementById('calcInputWrapper').style.display).toBe('none');
  });

  test('in today view: empties the lineup and refreshes the roster', () => {
    addChipToLineup(44, 'ns1');
    expect(document.getElementById('lineup').children.length).toBeGreaterThan(0);
    window.setNoStaff();
    // setNoStaff() calls refreshRoster() which rebuilds from the database,
    // so the lineup should be empty and the roster repopulated with DB providers.
    expect(document.getElementById('lineup').children.length).toBe(0);
    expect(document.getElementById('roster').children.length).toBeGreaterThan(0);
  });

  test('in week view: clears all drag-zone cells', () => {
    window.switchView('week');
    // Manually seed a chip into a week zone to verify it gets cleared.
    const zone = document.querySelector('.week-drag-zone');
    if (zone) {
      const dummy = document.createElement('div');
      dummy.className = 'provider-chip';
      zone.appendChild(dummy);
    }
    window.setNoStaff();
    document.querySelectorAll('.week-drag-zone').forEach(z => {
      expect(z.innerHTML).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// switchView()
// ---------------------------------------------------------------------------
describe('switchView()', () => {
  beforeEach(() => { window.switchView('today'); });

  test('switching to "week" updates the active button state', () => {
    window.switchView('week');
    expect(document.getElementById('btnWeek').classList.contains('active')).toBe(true);
    expect(document.getElementById('btnToday').classList.contains('active')).toBe(false);
  });

  test('switching to "today" updates the active button state', () => {
    window.switchView('week');
    window.switchView('today');
    expect(document.getElementById('btnToday').classList.contains('active')).toBe(true);
    expect(document.getElementById('btnWeek').classList.contains('active')).toBe(false);
  });

  test('switching to "week" shows the week container', () => {
    window.switchView('week');
    expect(document.getElementById('weekViewContainer').style.display).toBe('grid');
    expect(document.getElementById('todayViewContainer').style.display).toBe('none');
  });

  test('switching to "today" shows the today container', () => {
    window.switchView('week');
    window.switchView('today');
    expect(document.getElementById('todayViewContainer').style.display).toBe('block');
    expect(document.getElementById('weekViewContainer').style.display).toBe('none');
  });

  test('sets the correct schedule title for today view', () => {
    window.switchView('today');
    expect(document.getElementById('scheduleTitle').innerText).toBe("Today's Schedule");
  });

  test('sets the correct schedule title for week view', () => {
    window.switchView('week');
    expect(document.getElementById('scheduleTitle').innerText).toBe('Weekly Schedule');
  });

  test('clears the unfilled spots value on switch', () => {
    document.getElementById('unfilledSpots').value = '7';
    window.switchView('week');
    expect(document.getElementById('unfilledSpots').value).toBe('');
  });

  test('hides the result box on switch', () => {
    document.getElementById('resultBox').style.display = 'block';
    window.switchView('week');
    expect(document.getElementById('resultBox').style.display).toBe('none');
  });

  test('clears the lineup when switching to today', () => {
    addChipToLineup(44, 'sv1');
    window.switchView('today');
    expect(document.getElementById('lineup').innerHTML).toBe('');
  });
});

// ---------------------------------------------------------------------------
// adjustNumber()
// ---------------------------------------------------------------------------
describe('adjustNumber()', () => {
  beforeEach(() => { window.switchView('today'); });

  test('increments the unfilled spots input', () => {
    document.getElementById('unfilledSpots').value = '5';
    window.adjustNumber('unfilledSpots', 1);
    expect(document.getElementById('unfilledSpots').value).toBe('6');
  });

  test('decrements the unfilled spots input', () => {
    document.getElementById('unfilledSpots').value = '5';
    window.adjustNumber('unfilledSpots', -1);
    expect(document.getElementById('unfilledSpots').value).toBe('4');
  });

  test('treats an empty value as 0 before adjusting', () => {
    document.getElementById('unfilledSpots').value = '';
    window.adjustNumber('unfilledSpots', 1);
    expect(document.getElementById('unfilledSpots').value).toBe('1');
  });

  test('calls updateTotalSpots when adjusting a provider slots input', () => {
    const inputId = addChipToLineup(44, 'adj1');
    const spy = jest.spyOn(window, 'updateTotalSpots');
    window.adjustNumber(inputId, 1);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// updateTotalSpots()
// ---------------------------------------------------------------------------
describe('updateTotalSpots()', () => {
  beforeEach(() => { window.switchView('today'); });

  test('shows 0 when the lineup is empty', () => {
    window.updateTotalSpots();
    expect(document.getElementById('totalSpots').value).toBe('0');
  });

  test('sums all provider chips in the today lineup', () => {
    addChipToLineup(44, 'ts1');
    addChipToLineup(88, 'ts2');
    window.updateTotalSpots();
    expect(document.getElementById('totalSpots').value).toBe('132');
  });

  test('updates the total when a chip is removed', () => {
    addChipToLineup(44, 'tr1');
    addChipToLineup(88, 'tr2');
    document.getElementById('tr2').remove();
    window.updateTotalSpots();
    expect(document.getElementById('totalSpots').value).toBe('44');
  });
});
