import assert from 'node:assert/strict';
import Module from 'node:module';
import { beforeEach, describe, it } from 'node:test';

type Listener = (value: unknown, opts?: unknown) => Promise<unknown> | unknown;

interface MockTimer {
  callback: () => void;
  delay: number;
  cleared?: boolean;
}

interface RegisteredCapability {
  commandClass: string;
  opts: {
    fn?: (...args: unknown[]) => void;
    setOpts?: { fn?: (...args: unknown[]) => void };
    reportOpts?: { fn?: (...args: unknown[]) => void };
  };
}

/**
 * Stand-in for homey-zwavedriver's ZwaveDevice (which in turn is a Homey
 * Device). Only the surface used by BusT4Device is implemented.
 */
class MockZwaveDevice {

  baseDeleted = false;
  capabilities = new Set<string>(['onoff']);
  capabilityListeners: Record<string, Listener> = {};
  deviceClass = 'other';
  lastGarageCommand: unknown = undefined;
  registeredCapabilities: Record<string, RegisteredCapability> = {};
  values: Record<string, unknown> = {
    alarm_generic: false,
    notification: null,
    state: 'closed',
  };

  driver = {
    notificationReceivedTrigger: {
      trigger: async (): Promise<unknown> => undefined,
    },
    stateChangedTrigger: {
      trigger: async (): Promise<unknown> => undefined,
    },
  };

  homey = {
    clearTimeout: (timer: MockTimer) => {
      timer.cleared = true;
    },
    setTimeout: (callback: () => void, delay: number): MockTimer => ({ callback, delay }),
  };

  addCapability(capability: string): Promise<void> {
    this.capabilities.add(capability);
    return Promise.resolve();
  }

  getCapabilityValue(capability: string): unknown {
    return this.values[capability];
  }

  getClass(): string {
    return this.deviceClass;
  }

  getName(): string {
    return 'Test gate';
  }

  getSetting(): unknown {
    return 10000;
  }

  hasCapability(capability: string): boolean {
    return this.capabilities.has(capability);
  }

  log(): void {}

  error(): void {}

  onDeleted(): void {
    this.baseDeleted = true;
  }

  removeCapability(capability: string): Promise<void> {
    this.capabilities.delete(capability);
    return Promise.resolve();
  }

  registerCapabilityListener(capability: string, listener: Listener): void {
    this.capabilityListeners[capability] = listener;
  }

  triggerCapabilityListener(capability: string, value: unknown, opts?: unknown): Promise<unknown> {
    return Promise.resolve(this.capabilityListeners[capability](value, opts));
  }

  setCapabilityValue(capability: string, value: unknown): Promise<void> {
    this.values[capability] = value;
    return Promise.resolve();
  }

  setClass(deviceClass: string): Promise<void> {
    this.deviceClass = deviceClass;
    return Promise.resolve();
  }

  enableDebug(): void {}

  registerCapability(capability: string, commandClass: string, opts: RegisteredCapability['opts']): void {
    this.registeredCapabilities[capability] = { commandClass, opts };
  }

  registerReportListener(): void {}

  refreshCapabilityValue(): Promise<void> {
    return Promise.resolve();
  }

}

// Swap homey-zwavedriver for the mock before the device module is loaded.
type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
const moduleInternals = Module as unknown as { _load: ModuleLoader };
const originalLoad = moduleInternals._load;
moduleInternals._load = function load(request, parent, isMain) {
  if (request === 'homey-zwavedriver') {
    return { ZwaveDevice: MockZwaveDevice };
  }
  return originalLoad.call(this, request, parent, isMain);
};
import BusT4DeviceClass = require('../drivers/bus-t4-z-wave-interface/device');
moduleInternals._load = originalLoad;

type BusT4Device = InstanceType<typeof BusT4DeviceClass>;
type TestDevice = Omit<BusT4Device, keyof MockZwaveDevice | '_timer'> & MockZwaveDevice & {
  _timer: MockTimer | null;
};

function createDevice(): TestDevice {
  return new BusT4DeviceClass() as unknown as TestDevice;
}

function gateReport(currentValue: number, targetValue: number) {
  return {
    'Current Value (Raw)': Buffer.from([currentValue]),
    'Target Value (Raw)': Buffer.from([targetValue]),
  };
}

const nextTick = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('BusT4Device migration', () => {
  let device: TestDevice;

  beforeEach(() => {
    device = createDevice();
  });

  it('migrates a v1 device without touching onoff', async () => {
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
  let device: TestDevice;

  beforeEach(() => {
    device = createDevice();
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

  it('registers the onoff sync where homey-zwavedriver actually reads it', async () => {
    const v1Device = createDevice();
    v1Device.values.onoff = false;

    await v1Device.onNodeInit();

    const { opts } = v1Device.registeredCapabilities.garagedoor_closed;
    assert.equal(opts.fn, undefined);
    assert.equal(typeof opts.setOpts?.fn, 'function');
    assert.equal(typeof opts.reportOpts?.fn, 'function');

    // gate reported open -> legacy onoff must become true
    opts.reportOpts?.fn?.call(v1Device, false);
    await nextTick();
    assert.equal(v1Device.getCapabilityValue('onoff'), true);

    // app commanded close -> legacy onoff must become false
    opts.setOpts?.fn?.call(v1Device, true);
    await nextTick();
    assert.equal(v1Device.getCapabilityValue('onoff'), false);
  });

  it('does not register the bridge on a v2 device without onoff', () => {
    const v2Device = createDevice();
    v2Device.capabilities.delete('onoff');

    v2Device._registerLegacyOnOffCapability();

    assert.equal(v2Device.capabilityListeners.onoff, undefined);
  });
});

describe('BusT4Device state handling', () => {
  let device: TestDevice;

  beforeEach(() => {
    device = createDevice();
  });

  it('updates the capability before triggering its Flow', async () => {
    let triggered = false;
    device.driver.stateChangedTrigger.trigger = async () => {
      assert.equal(device.getCapabilityValue('state'), 'opening');
      triggered = true;
    };

    await device.setState('opening');
    await nextTick();

    assert.equal(triggered, true);
  });

  it('keeps applying reported states while a Flow trigger never settles', async () => {
    device.driver.stateChangedTrigger.trigger = () => new Promise(() => {});

    device._gateReportParser(gateReport(0xFE, 0x63));
    device._gateReportParser(gateReport(0x63, 0x63));
    device._gateReportParser(gateReport(0xFE, 0x00));
    device._gateReportParser(gateReport(0x00, 0x00));
    await device._stateUpdateQueue;

    assert.equal(device.getCapabilityValue('state'), 'closed');
  });

  it('keeps applying states while a notification Flow trigger never settles', async () => {
    device.driver.notificationReceivedTrigger.trigger = () => new Promise(() => {});

    await device.setNotification('beam');
    assert.equal(device.getCapabilityValue('notification'), 'beam');
    assert.equal(device.getCapabilityValue('alarm_generic'), true);

    // closed resets the notification through the notification queue
    device.values.state = 'closing';
    await device.setState('closed');

    assert.equal(device.getCapabilityValue('state'), 'closed');
    assert.equal(device.getCapabilityValue('notification'), null);
    assert.equal(device.getCapabilityValue('alarm_generic'), false);
  });

  it('logs a rejected Flow trigger instead of failing the state update', async () => {
    const errors: unknown[][] = [];
    device.error = (...args: unknown[]) => {
      errors.push(args);
    };
    device.driver.stateChangedTrigger.trigger = async () => {
      throw new Error('flow engine down');
    };

    await device.setState('opening');
    await nextTick();

    assert.equal(device.getCapabilityValue('state'), 'opening');
    assert.equal(errors.length, 1);
    assert.equal((errors[0][2] as Error).message, 'flow engine down');
  });

  it('keeps the fallback timer for a duplicate movement report', () => {
    device.values.state = 'opening';
    device._setTimerState('open');
    const timer = device._timer;

    assert.equal(device._gateReportParser(gateReport(0xFE, 0x63)), false);
    assert.equal(device._timer, timer);
    assert.notEqual(timer?.cleared, true);
  });

  it('clears all timing state for a terminal report', () => {
    device.values.state = 'opening';
    device._setTimerState('open');
    const timer = device._timer;

    assert.equal(device._gateReportParser(gateReport(0x63, 0x63)), false);
    assert.equal(timer?.cleared, true);
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

    assert.equal(timer?.cleared, true);
    assert.equal(device._movementStartedAt, null);
    assert.equal(device.baseDeleted, true);
  });
});

describe('BusT4Device set parser', () => {
  let device: TestDevice;

  beforeEach(() => {
    device = createDevice();
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

  it('applies the final state when the fallback timer fires', async () => {
    device.values.state = 'closed';
    device._gateSetParser(false);
    const timer = device._timer;
    assert.ok(timer);

    timer.callback();
    await device._stateUpdateQueue;

    assert.equal(device.getCapabilityValue('state'), 'open');
    assert.equal(device._timer, null);
    assert.equal(device._movementStartedAt, null);
  });
});
