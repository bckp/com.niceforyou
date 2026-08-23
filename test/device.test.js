'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const { beforeEach, describe, it } = require('node:test');

class MockZwaveDevice {

  constructor() {
    this.capabilities = new Set(['onoff']);
    this.capabilityListeners = {};
    this.deviceClass = 'other';
    this.values = {
      alarm_generic: false,
      notification: null,
      state: 'closed',
    };
    this.driver = {
      notificationReceivedTrigger: {
        trigger: async () => {},
      },
      stateChangedTrigger: {
        trigger: async () => {},
      },
    };
    this.homey = {
      clearTimeout: (timer) => {
        timer.cleared = true;
      },
      setTimeout: (callback, delay) => ({ callback, delay }),
    };
  }

  addCapability(capability) {
    this.capabilities.add(capability);
    return Promise.resolve();
  }

  getCapabilityValue(capability) {
    return this.values[capability];
  }

  getClass() {
    return this.deviceClass;
  }

  getName() {
    return 'Test gate';
  }

  getSetting() {
    return 10000;
  }

  hasCapability(capability) {
    return this.capabilities.has(capability);
  }

  log() {}

  error() {}

  onDeleted() {
    this.baseDeleted = true;
  }

  removeCapability(capability) {
    this.capabilities.delete(capability);
    return Promise.resolve();
  }

  registerCapabilityListener(capability, listener) {
    this.capabilityListeners[capability] = listener;
  }

  triggerCapabilityListener(capability, value, opts) {
    return this.capabilityListeners[capability](value, opts);
  }

  setCapabilityValue(capability, value) {
    this.values[capability] = value;
    return Promise.resolve();
  }

  setClass(deviceClass) {
    this.deviceClass = deviceClass;
    return Promise.resolve();
  }

}

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'homey-zwavedriver') {
    return { ZwaveDevice: MockZwaveDevice };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const BusT4Device = require('../drivers/bus-t4-z-wave-interface/device');
Module._load = originalLoad;

function gateReport(currentValue, targetValue) {
  return {
    'Current Value (Raw)': Buffer.from([currentValue]),
    'Target Value (Raw)': Buffer.from([targetValue]),
  };
}

describe('BusT4Device migration', () => {
  let device;

  beforeEach(() => {
    device = new BusT4Device();
  });

  it('migrates class and capabilities before resolving', async () => {
    await device.initMigration();

    assert.equal(device.getClass(), 'garagedoor');
    assert.equal(device.hasCapability('alarm_generic'), true);
    assert.equal(device.hasCapability('garagedoor_closed'), true);
    assert.equal(device.hasCapability('onoff'), true);
  });

  it('does not add onoff to an already-migrated v2 device', async () => {
    device.deviceClass = 'garagedoor';
    device.capabilities = new Set(['alarm_generic', 'garagedoor_closed']);

    await device.initMigration();

    assert.equal(device.hasCapability('onoff'), false);
  });

  it('repairs missing capabilities even when the class is current', async () => {
    device.deviceClass = 'garagedoor';
    device.capabilities.delete('onoff');

    await device.initMigration();

    assert.equal(device.hasCapability('alarm_generic'), true);
    assert.equal(device.hasCapability('garagedoor_closed'), true);
    assert.equal(device.hasCapability('onoff'), false);
  });
});

describe('BusT4Device v1 onoff compatibility', () => {
  let device;

  beforeEach(() => {
    device = new BusT4Device();
    device.capabilities.add('garagedoor_closed');
    device.registerCapabilityListener('garagedoor_closed', async (isClosed) => {
      device.lastGarageCommand = isClosed;
    });
    device._registerLegacyOnOffCapability();
  });

  it('translates legacy on commands to an open garage-door command', async () => {
    await device.triggerCapabilityListener('onoff', true);

    assert.equal(device.lastGarageCommand, false);
    assert.equal(device.getCapabilityValue('garagedoor_closed'), false);
    assert.equal(device.getCapabilityValue('onoff'), true);
  });

  it('translates legacy off commands to a closed garage-door command', async () => {
    await device.triggerCapabilityListener('onoff', false);

    assert.equal(device.lastGarageCommand, true);
    assert.equal(device.getCapabilityValue('garagedoor_closed'), true);
    assert.equal(device.getCapabilityValue('onoff'), false);
  });

  it('mirrors physical garage-door reports to the legacy capability', async () => {
    await device._syncLegacyOnOff(true);
    assert.equal(device.getCapabilityValue('onoff'), false);

    await device._syncLegacyOnOff(false);
    assert.equal(device.getCapabilityValue('onoff'), true);
  });

  it('does not register the bridge on a v2 device without onoff', () => {
    const v2Device = new BusT4Device();
    v2Device.capabilities.delete('onoff');

    v2Device._registerLegacyOnOffCapability();

    assert.equal(v2Device.capabilityListeners.onoff, undefined);
  });
});

describe('BusT4Device state handling', () => {
  let device;

  beforeEach(() => {
    device = new BusT4Device();
  });

  it('updates the capability before triggering its Flow', async () => {
    device.driver.stateChangedTrigger.trigger = async () => {
      assert.equal(device.getCapabilityValue('state'), 'opening');
    };

    await device.setState('opening');
  });

  it('keeps the fallback timer for a duplicate movement report', () => {
    device.values.state = 'opening';
    device._setTimerState('open');
    const timer = device._timer;

    assert.equal(device._gateReportParser(gateReport(0xFE, 0x63)), false);
    assert.equal(device._timer, timer);
    assert.notEqual(timer.cleared, true);
  });

  it('clears all timing state for a terminal report', () => {
    device.values.state = 'opening';
    device._setTimerState('open');
    const timer = device._timer;

    assert.equal(device._gateReportParser(gateReport(0x63, 0x63)), false);
    assert.equal(timer.cleared, true);
    assert.equal(device._timer, null);
    assert.equal(device._movementStartedAt, null);
  });

  it('ignores an unknown state report', () => {
    device.values.state = 'open';

    assert.equal(device._gateReportParser(gateReport(0x01, 0x02)), null);
    assert.equal(device.getCapabilityValue('state'), 'open');
  });

  it('cleans up custom timing and base resources when deleted', () => {
    device._setTimerState('open');
    const timer = device._timer;

    device.onDeleted();

    assert.equal(timer.cleared, true);
    assert.equal(device._movementStartedAt, null);
    assert.equal(device.baseDeleted, true);
  });
});

describe('BusT4Device set parser', () => {
  let device;

  beforeEach(() => {
    device = new BusT4Device();
  });

  it('commands opening from closed state', async () => {
    device.values.state = 'closed';

    const result = device._gateSetParser(false);

    assert.deepEqual(result, {
      Value: 'on/enable',
      'Dimming Duration': 'Default',
    });
    await device._stateUpdateQueue;
    assert.equal(device.getCapabilityValue('state'), 'opening');
    assert.equal(device._timerTargetState, 'open');
    assert.notEqual(device._timer, null);
  });

  it('commands closing from open state', async () => {
    device.values.state = 'open';

    const result = device._gateSetParser(true);

    assert.deepEqual(result, {
      Value: 'off/disable',
      'Dimming Duration': 'Default',
    });
    await device._stateUpdateQueue;
    assert.equal(device.getCapabilityValue('state'), 'closing');
    assert.equal(device._timerTargetState, 'closed');
    assert.notEqual(device._timer, null);
  });

  it('does not re-trigger movement when open command given and already open', async () => {
    device.values.state = 'open';

    const result = device._gateSetParser(false);

    assert.deepEqual(result, {
      Value: 'on/enable',
      'Dimming Duration': 'Default',
    });
    await device._stateUpdateQueue;
    assert.equal(device.getCapabilityValue('state'), 'open');
    assert.equal(device._timer, null);
  });

  it('does not re-trigger movement when close command given and already closed', async () => {
    device.values.state = 'closed';

    const result = device._gateSetParser(true);

    assert.deepEqual(result, {
      Value: 'off/disable',
      'Dimming Duration': 'Default',
    });
    await device._stateUpdateQueue;
    assert.equal(device.getCapabilityValue('state'), 'closed');
    assert.equal(device._timer, null);
  });
});

