'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  decodeGateStateReport,
  decodeNotificationReport,
} = require('../lib/nice-protocol');

function gateReport(currentValue, targetValue) {
  return {
    'Current Value (Raw)': Buffer.from([currentValue]),
    'Target Value (Raw)': Buffer.from([targetValue]),
  };
}

describe('decodeGateStateReport', () => {
  const cases = [
    [0x00, 0x00, 'closed'],
    [0x63, 0x63, 'open'],
    [0xFE, 0x00, 'closing'],
    [0xFE, 0x63, 'opening'],
    [0xFE, 0xFE, 'stopped'],
  ];

  cases.forEach(([currentValue, targetValue, expectedState]) => {
    it(`decodes ${expectedState}`, () => {
      const result = decodeGateStateReport(gateReport(currentValue, targetValue));
      assert.equal(result.state, expectedState);
    });
  });

  it('preserves diagnostic values for an unknown state', () => {
    const result = decodeGateStateReport(gateReport(0x01, 0x02));
    assert.deepEqual(result, {
      currentValue: 1,
      state: null,
      stateCode: 3,
      targetValue: 2,
    });
  });

  it('ignores incomplete reports', () => {
    assert.equal(decodeGateStateReport({}), null);
  });
});

describe('decodeNotificationReport', () => {
  it('decodes motor resistance', () => {
    assert.equal(decodeNotificationReport({
      Event: 0x41,
      'Notification Type': 'Access Control',
    }), 'engine');
  });

  it('decodes a safety beam obstacle', () => {
    assert.equal(decodeNotificationReport({
      Event: 0x48,
      'Notification Type': 'Access Control',
    }), 'beam');
  });

  it('decodes an external device failure', () => {
    assert.equal(decodeNotificationReport({
      Event: 0x03,
      'Event Parameter': Buffer.from([0x05]),
      'Notification Type': 'System',
    }), 'external');
  });

  it('ignores the unrelated non-Z-Wave remote event', () => {
    assert.equal(decodeNotificationReport({
      Event: 0x4C,
      'Notification Type': 'Access Control',
    }), undefined);
  });

  it('clears an inactive access-control obstacle', () => {
    assert.equal(decodeNotificationReport({
      Event: 0,
      'Event Parameter': Buffer.from([0x48]),
      'Notification Type': 'Access Control',
    }), null);
  });

  it('clears an inactive external device failure', () => {
    assert.equal(decodeNotificationReport({
      Event: 0,
      'Event Parameter': Buffer.from([0x03]),
      'Notification Type': 'System',
    }), null);
  });
});
