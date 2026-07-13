'use strict';

const GATE_STATES = Object.freeze({
  CLOSED: 'closed',
  CLOSING: 'closing',
  OPEN: 'open',
  OPENING: 'opening',
  STOPPED: 'stopped',
});

const GATE_STATE_BY_CODE = Object.freeze({
  0: GATE_STATES.CLOSED,
  198: GATE_STATES.OPEN,
  254: GATE_STATES.CLOSING,
  353: GATE_STATES.OPENING,
  508: GATE_STATES.STOPPED,
});

const ACCESS_CONTROL_OBSTACLE_SOURCE = Object.freeze({
  65: 'engine',
  72: 'beam',
});

const NOTIFICATION_TYPE_ACCESS_CONTROL = 'Access Control';
const NOTIFICATION_TYPE_SYSTEM = 'System';
const EVENT_INACTIVE = 0;
const SYSTEM_HARDWARE_FAILURE_EVENT = 3;
const EXTERNAL_DEVICE_NOT_DETECTED_PARAMETER = 5;

function firstByte(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (value && typeof value[0] === 'number') {
    return value[0];
  }
  return null;
}

function decodeGateStateReport(report) {
  if (
    !report
    || !Object.prototype.hasOwnProperty.call(report, 'Current Value (Raw)')
    || !Object.prototype.hasOwnProperty.call(report, 'Target Value (Raw)')
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
    state: GATE_STATE_BY_CODE[stateCode] || null,
    stateCode,
    targetValue,
  };
}

function decodeNotificationReport(report) {
  if (!report || !Object.prototype.hasOwnProperty.call(report, 'Event')) {
    return undefined;
  }

  const notificationType = report['Notification Type'];
  const event = firstByte(report.Event);
  const eventParameter = firstByte(report['Event Parameter']);

  if (notificationType === NOTIFICATION_TYPE_ACCESS_CONTROL) {
    if (
      event === EVENT_INACTIVE
      && Object.prototype.hasOwnProperty.call(ACCESS_CONTROL_OBSTACLE_SOURCE, eventParameter)
    ) {
      return null;
    }
    return ACCESS_CONTROL_OBSTACLE_SOURCE[event];
  }

  if (notificationType === NOTIFICATION_TYPE_SYSTEM) {
    if (event === EVENT_INACTIVE && eventParameter === SYSTEM_HARDWARE_FAILURE_EVENT) {
      return null;
    }
    if (
      event === SYSTEM_HARDWARE_FAILURE_EVENT
      && eventParameter === EXTERNAL_DEVICE_NOT_DETECTED_PARAMETER
    ) {
      return 'external';
    }
  }

  return undefined;
}

module.exports = {
  GATE_STATES,
  decodeGateStateReport,
  decodeNotificationReport,
};
