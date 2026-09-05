/**
 * Decoders for the Z-Wave payloads sent by the Nice BusT4 (IBT4ZWAVE) interface.
 * Pure functions, no Homey dependencies, so they can be unit tested in isolation.
 */

export const GATE_STATES = Object.freeze({
  CLOSED: 'closed',
  CLOSING: 'closing',
  OPEN: 'open',
  OPENING: 'opening',
  STOPPED: 'stopped',
} as const);

export type GateState = (typeof GATE_STATES)[keyof typeof GATE_STATES];

export const NOTIFICATIONS = Object.freeze({
  BEAM: 'beam',
  ENGINE: 'engine',
  EXTERNAL: 'external',
} as const);

export type Notification = (typeof NOTIFICATIONS)[keyof typeof NOTIFICATIONS];

/**
 * The gate reports SWITCH_MULTILEVEL with current + target value. The sum of
 * both raw bytes uniquely identifies the state:
 *   0   = 0x00 + 0x00 closed
 *   198 = 0x63 + 0x63 open
 *   254 = 0xFE + 0x00 closing (unknown position, target closed)
 *   353 = 0xFE + 0x63 opening (unknown position, target open)
 *   508 = 0xFE + 0xFE stopped
 */
const GATE_STATE_BY_CODE: Readonly<Record<number, GateState>> = Object.freeze({
  0: GATE_STATES.CLOSED,
  198: GATE_STATES.OPEN,
  254: GATE_STATES.CLOSING,
  353: GATE_STATES.OPENING,
  508: GATE_STATES.STOPPED,
});

const ACCESS_CONTROL_OBSTACLE_SOURCE: Readonly<Record<number, Notification>> = Object.freeze({
  65: NOTIFICATIONS.ENGINE,
  72: NOTIFICATIONS.BEAM,
});

const NOTIFICATION_TYPE_ACCESS_CONTROL = 'Access Control';
const NOTIFICATION_TYPE_SYSTEM = 'System';
const EVENT_INACTIVE = 0;
const SYSTEM_HARDWARE_FAILURE_EVENT = 3;
const EXTERNAL_DEVICE_NOT_DETECTED_PARAMETER = 5;

export interface GateStateReport {
  currentValue: number;
  state: GateState | null;
  stateCode: number;
  targetValue: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Homey hands raw values over as Buffers, parsed values as numbers (or
 * strings such as 'on/enable'). Accept both, ignore everything else.
 */
function firstByte(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }
  if (isRecord(value) || Array.isArray(value)) {
    const first = (value as ArrayLike<unknown>)[0];
    if (typeof first === 'number') {
      return first;
    }
  }
  return null;
}

export function decodeGateStateReport(report: unknown): GateStateReport | null {
  if (
    !isRecord(report)
    || !hasOwn(report, 'Current Value (Raw)')
    || !hasOwn(report, 'Target Value (Raw)')
  ) {
    return null;
  }

  const currentValue = firstByte(report['Current Value (Raw)']);
  const targetValue = firstByte(report['Target Value (Raw)']);
  if (currentValue === null || targetValue === null) {
    return null;
  }

  const stateCode = currentValue + targetValue;
  return {
    currentValue,
    state: GATE_STATE_BY_CODE[stateCode] ?? null,
    stateCode,
    targetValue,
  };
}

/**
 * @returns the notification to activate, `null` to clear the active
 *   notification, or `undefined` when the report is not relevant.
 */
export function decodeNotificationReport(report: unknown): Notification | null | undefined {
  if (!isRecord(report) || !hasOwn(report, 'Event')) {
    return undefined;
  }

  const notificationType = report['Notification Type'];
  const event = firstByte(report.Event);
  const eventParameter = firstByte(report['Event Parameter']);

  if (notificationType === NOTIFICATION_TYPE_ACCESS_CONTROL) {
    if (
      event === EVENT_INACTIVE
      && eventParameter !== null
      && hasOwn(ACCESS_CONTROL_OBSTACLE_SOURCE, String(eventParameter))
    ) {
      return null;
    }
    return event === null ? undefined : ACCESS_CONTROL_OBSTACLE_SOURCE[event];
  }

  if (notificationType === NOTIFICATION_TYPE_SYSTEM) {
    if (event === EVENT_INACTIVE && eventParameter === SYSTEM_HARDWARE_FAILURE_EVENT) {
      return null;
    }
    if (
      event === SYSTEM_HARDWARE_FAILURE_EVENT
      && eventParameter === EXTERNAL_DEVICE_NOT_DETECTED_PARAMETER
    ) {
      return NOTIFICATIONS.EXTERNAL;
    }
  }

  return undefined;
}
