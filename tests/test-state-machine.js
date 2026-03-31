/**
 * Test: Intake case status state machine
 * Validates that status transitions follow the defined rules
 * Run: node --test tests/test-state-machine.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Mirror of the state machine from server.js
const ALLOWED_TRANSITIONS = {
  'registered':       ['collecting_docs'],
  'collecting_docs':  ['registered', 'contract_signed'],
  'contract_signed':  ['collecting_docs', 'visa_in_progress'],
  'visa_in_progress': ['contract_signed', 'ipa_received'],
  'ipa_received':     ['visa_in_progress', 'paid'],
  'paid':             ['ipa_received', 'arrived'],
  'arrived':          ['paid', 'oriented'],
  'oriented':         ['arrived', 'closed'],
  'closed':           [],
};

const ALL_STATUSES = Object.keys(ALLOWED_TRANSITIONS);

describe('Intake Case State Machine', () => {
  it('should have 9 statuses', () => {
    assert.equal(ALL_STATUSES.length, 9);
  });

  it('closed should be a terminal state', () => {
    assert.deepEqual(ALLOWED_TRANSITIONS['closed'], []);
  });

  it('registered should only go to collecting_docs', () => {
    assert.deepEqual(ALLOWED_TRANSITIONS['registered'], ['collecting_docs']);
  });

  it('should not allow skipping steps', () => {
    // Can't go from registered directly to contract_signed
    assert.ok(!ALLOWED_TRANSITIONS['registered'].includes('contract_signed'));
    // Can't go from collecting_docs directly to visa_in_progress
    assert.ok(!ALLOWED_TRANSITIONS['collecting_docs'].includes('visa_in_progress'));
    // Can't go from registered directly to closed
    assert.ok(!ALLOWED_TRANSITIONS['registered'].includes('closed'));
  });

  it('should allow backward transitions (one step)', () => {
    assert.ok(ALLOWED_TRANSITIONS['collecting_docs'].includes('registered'));
    assert.ok(ALLOWED_TRANSITIONS['contract_signed'].includes('collecting_docs'));
    assert.ok(ALLOWED_TRANSITIONS['arrived'].includes('paid'));
  });

  it('should not allow backward jumps (more than one step)', () => {
    assert.ok(!ALLOWED_TRANSITIONS['contract_signed'].includes('registered'));
    assert.ok(!ALLOWED_TRANSITIONS['arrived'].includes('collecting_docs'));
  });

  it('all transition targets should be valid statuses', () => {
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        assert.ok(ALL_STATUSES.includes(to), `Invalid target '${to}' from '${from}'`);
      }
    }
  });

  it('every non-terminal status should have at least one forward path to closed', () => {
    for (const start of ALL_STATUSES) {
      if (start === 'closed') continue;
      const visited = new Set();
      const queue = [start];
      let reachable = false;
      while (queue.length > 0) {
        const current = queue.shift();
        if (current === 'closed') { reachable = true; break; }
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of ALLOWED_TRANSITIONS[current]) {
          if (!visited.has(next)) queue.push(next);
        }
      }
      assert.ok(reachable, `Status '${start}' cannot reach 'closed'`);
    }
  });

  it('processing is NOT a valid status', () => {
    assert.ok(!ALL_STATUSES.includes('processing'), 'processing should not be in state machine');
  });
});
