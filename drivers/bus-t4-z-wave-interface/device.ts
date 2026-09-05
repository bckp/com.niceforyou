import type Homey from 'homey';
import { ZwaveDevice } from 'homey-zwavedriver';
import {
  GATE_STATES,
  decodeGateStateReport,
  decodeNotificationReport,
} from '../../lib/nice-protocol';
import type { GateState, Notification } from '../../lib/nice-protocol';

type BusT4Driver = InstanceType<typeof import('./driver')>;

interface SwitchMultilevelSetPayload {
  Value: 'on/enable' | 'off/disable';
  'Dimming Duration': string;
}

const STATE_OPEN = GATE_STATES.OPEN;
const STATE_CLOSED = GATE_STATES.CLOSED;
const STATE_OPENING = GATE_STATES.OPENING;
const STATE_CLOSING = GATE_STATES.CLOSING;
const STATE_STOPPED = GATE_STATES.STOPPED;

const DEFAULT_GATE_STATE_TIMEOUT = 10000;

class BusT4Device extends ZwaveDevice {

  _movementStartedAt: number | null = null;
  _notificationUpdateQueue: Promise<void> = Promise.resolve();
  _stateUpdateQueue: Promise<void> = Promise.resolve();
  _timer: NodeJS.Timeout | null = null;
  _timerTargetState: GateState | null = null;

  get busDriver(): BusT4Driver {
    return this.driver as BusT4Driver;
  }

  override async onNodeInit(): Promise<void> {
    this.log('BusT4Device has been initialized');
    this.enableDebug();

    await this.initMigration();

    // Capabilities
    this.registerCapability('garagedoor_closed', 'SWITCH_MULTILEVEL', {
      get: 'SWITCH_MULTILEVEL_GET',
      set: 'SWITCH_MULTILEVEL_SET',
      report: 'SWITCH_MULTILEVEL_REPORT',
      reportParserOverride: true,
      getOnStart: true,
      // homey-zwavedriver reads the post-set / post-report hook from
      // setOpts.fn and reportOpts.fn, a top-level `fn` is ignored.
      setOpts: { fn: this._onGarageDoorValue.bind(this) },
      reportOpts: { fn: this._onGarageDoorValue.bind(this) },
      setParser: this._gateSetParser.bind(this),
      reportParser: this._gateReportParser.bind(this),
    });

    // Keep onoff working only on v1 devices that still carry the capability.
    this._registerLegacyOnOffCapability();

    // Refresh state
    this.refreshCapabilityValue('garagedoor_closed', 'SWITCH_MULTILEVEL').catch(
      (err: unknown) => this.log('Could not refresh capability value', err),
    );

    // Notification listener
    this.registerReportListener('NOTIFICATION', 'NOTIFICATION_REPORT', this.onNotificationReport.bind(this));

    // Keep the persisted active alarm synchronized with alarm_generic.
    await this.setNotification(this.getNotification(), true);
  }

  async initMigration(): Promise<void> {
    if (this.getClass() !== 'garagedoor') {
      this.log(`Changing class on ${this.getName()} from ${this.getClass()} to garagedoor`);
      await this.setClass('garagedoor');
    }

    // Capabilities
    if (!this.hasCapability('alarm_generic')) {
      await this.addCapability('alarm_generic');
    }
    if (!this.hasCapability('garagedoor_closed')) {
      await this.addCapability('garagedoor_closed');
    }
  }

  getGateState(): GateState | null {
    return (this.getCapabilityValue('state') as GateState | null) ?? null;
  }

  getNotification(): Notification | null {
    return (this.getCapabilityValue('notification') as Notification | null) ?? null;
  }

  async onNotificationReport(report: unknown): Promise<void> {
    this.log('Notification received', report);

    const notification = decodeNotificationReport(report);
    if (notification !== undefined) {
      try {
        await this.setNotification(notification);
      } catch (err) {
        this.error('Could not process notification report', err);
      }
    }
  }

  /**
   * Set state capability and trigger flows. Updates are serialized so a
   * burst of reports is applied in order.
   */
  setState(state: GateState, silent = false): Promise<void> {
    const operation = this._stateUpdateQueue.then(
      () => this._applyState(state, silent),
    );
    this._stateUpdateQueue = operation.catch(() => {});
    return operation;
  }

  async _applyState(state: GateState, silent: boolean): Promise<void> {
    // State is same, as what we want set
    if (this.getGateState() === state) {
      return;
    }

    // Reset notification on closed (closing is passed wrongly sometimes)
    if (STATE_CLOSED === state) {
      await this.setNotification(null);
    }

    this.log(`State changed to ${state}`);
    await this.setCapabilityValue('state', state);

    // If no silent mode for init, trigger
    if (!silent) {
      this._triggerFlow(this.busDriver.stateChangedTrigger, { state });
    }
  }

  /**
   * Fire a Flow trigger without blocking the update queues on it. The Flow
   * engine may take long (or never settle), which must not delay or block
   * subsequent capability updates.
   */
  _triggerFlow(card: Homey.FlowCardTriggerDevice, tokens: Record<string, unknown>): void {
    Promise.resolve()
      .then(() => card.trigger(this, tokens))
      .catch((err: unknown) => this.error('Could not trigger Flow', tokens, err));
  }

  /**
   * Set notification capability and trigger flows
   */
  setNotification(notification: Notification | null, silent = false): Promise<void> {
    const operation = this._notificationUpdateQueue.then(
      () => this._applyNotification(notification, silent),
    );
    this._notificationUpdateQueue = operation.catch(() => {});
    return operation;
  }

  async _applyNotification(notification: Notification | null, silent: boolean): Promise<void> {
    const currentValue = this.getNotification();

    await Promise.all([
      this.setCapabilityValue('notification', notification),
      this.setCapabilityValue('alarm_generic', notification !== null),
    ]);

    // Notification is already there
    if (currentValue === notification) {
      return;
    }

    this.log(`Notification changed to ${notification}`);

    // If notification is set, and no silent mode for init, trigger
    if (notification !== null && !silent) {
      this._triggerFlow(this.busDriver.notificationReceivedTrigger, { notification });
    }
  }

  /**
   * Called by homey-zwavedriver after a garagedoor_closed SET or REPORT.
   */
  _onGarageDoorValue(isClosed: unknown): void {
    this._syncLegacyOnOff(isClosed).catch(
      (err: unknown) => this.error('Could not synchronize legacy onoff capability', err),
    );
  }

  _registerLegacyOnOffCapability(): void {
    if (!this.hasCapability('onoff')) {
      return;
    }

    this.registerCapabilityListener('onoff', async (isOpen: boolean, opts: unknown) => {
      const isClosed = !isOpen;

      await this.triggerCapabilityListener('garagedoor_closed', isClosed, opts as object);
      await this.setCapabilityValue('garagedoor_closed', isClosed);
      await this._syncLegacyOnOff(isClosed);
    });
  }

  async _syncLegacyOnOff(isClosed: unknown): Promise<void> {
    if (
      typeof isClosed !== 'boolean'
      || !this.hasCapability('onoff')
      || this.getCapabilityValue('onoff') === !isClosed
    ) {
      return;
    }

    await this.setCapabilityValue('onoff', !isClosed);
  }

  /**
   * Set parser: garagedoor_closed `true` closes the gate (SWITCH_MULTILEVEL 0),
   * `false` opens it (0xFF). The commanded state is predicted immediately and
   * confirmed by the fallback timer or the gate's own reports.
   */
  _gateSetParser(value: boolean): SwitchMultilevelSetPayload {
    this.log('Set parser:', value);

    const state = this.getGateState();
    const shouldMove = value
      ? state !== STATE_CLOSED
      : state !== STATE_OPEN;

    if (shouldMove) {
      // set state, enable delayed state change
      this.setState(value ? STATE_CLOSING : STATE_OPENING).catch(
        (err: unknown) => this.error('Could not set commanded gate state', err),
      );

      // set timeout by user setting value, to change state again
      this._setTimerState(value ? STATE_CLOSED : STATE_OPEN);
    }

    return {
      Value: value ? 'off/disable' : 'on/enable',
      'Dimming Duration': 'Default',
    };
  }

  /**
   * Fallback: apply the final state once the configured movement time passed.
   */
  async _setDelayedState(state: GateState): Promise<void> {
    this._clearMovementTiming();

    await this.setState(state);
  }

  _setTimerState(state: GateState): void {
    this._clearTimerState();
    const time = this._getTimerTime();

    this.log('Set timer for: ', time);
    this._timerTargetState = state;
    this._timer = this.homey.setTimeout(() => {
      this._setDelayedState(state).catch(
        (err: unknown) => this.error('Could not set delayed gate state', err),
      );
    }, time);
    this._movementStartedAt = Date.now();
  }

  _getTimerTime(): number {
    const timeout = Number(this.getSetting('gate_state_timeout')) || DEFAULT_GATE_STATE_TIMEOUT;
    if (this._movementStartedAt) {
      return Math.min((Date.now() + 1000) - this._movementStartedAt, timeout);
    }
    return timeout;
  }

  _clearTimerState(): void {
    if (this._timer) {
      this.log(`Clear timer id: ${this._timer}`);
      this.homey.clearTimeout(this._timer);
    }
    this._timer = null;
    this._timerTargetState = null;
  }

  _clearMovementTiming(): void {
    this._clearTimerState();
    this._movementStartedAt = null;
  }

  /**
   * Report parser for state detection. Returns the garagedoor_closed value.
   */
  _gateReportParser(report: unknown): boolean | null {
    this.log('Gate report received', report);

    const decoded = decodeGateStateReport(report);
    if (!decoded) {
      return null;
    }

    const {
      currentValue, state: stateText, stateCode, targetValue,
    } = decoded;
    if (!stateText) {
      this.log(`Unknown gate status ${stateCode} (current: ${currentValue}, target: ${targetValue})`);
      return null;
    }

    this.log(`Gate status ${stateCode}, parsed: ${stateText}`);

    const expectedMovementState = this._timerTargetState === STATE_OPEN
      ? STATE_OPENING
      : STATE_CLOSING;
    if (stateText === STATE_OPEN || stateText === STATE_CLOSED) {
      this._clearMovementTiming();
    } else if (stateText === STATE_STOPPED) {
      this._clearTimerState();
    } else if (this._timer && stateText !== expectedMovementState) {
      this._clearTimerState();
    }

    this.setState(stateText).catch(
      (err: unknown) => this.error('Could not set reported gate state', err),
    );

    return stateText === STATE_CLOSED || stateText === STATE_CLOSING;
  }

  override onDeleted(): void {
    this._clearMovementTiming();
    return super.onDeleted();
  }

}

export = BusT4Device;
