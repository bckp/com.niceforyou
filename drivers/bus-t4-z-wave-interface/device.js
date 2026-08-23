'use strict';

const { ZwaveDevice } = require('homey-zwavedriver');
const {
  GATE_STATES,
  decodeGateStateReport,
  decodeNotificationReport,
} = require('../../lib/nice-protocol');

const STATE_OPEN = GATE_STATES.OPEN;
const STATE_CLOSED = GATE_STATES.CLOSED;
const STATE_OPENING = GATE_STATES.OPENING;
const STATE_CLOSING = GATE_STATES.CLOSING;
const STATE_STOPPED = GATE_STATES.STOPPED;

class BusT4Device extends ZwaveDevice {

    _movementStartedAt = null;
    _notificationUpdateQueue = Promise.resolve();
    _stateUpdateQueue = Promise.resolve();
    _timer = null;
    _timerTargetState = null;

    async onNodeInit({ node }) {
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
        fn: (isClosed) => {
          this._syncLegacyOnOff(isClosed).catch(
            (err) => this.error('Could not synchronize legacy onoff capability', err),
          );
        },
        setParser: this._gateSetParser.bind(this),
        reportParser: this._gateReportParser.bind(this),
      });

      // Keep onoff working only on v1 devices that still carry the capability.
      this._registerLegacyOnOffCapability();

      // Refresh state
      this.refreshCapabilityValue('garagedoor_closed', 'SWITCH_MULTILEVEL').catch(
        (err) => this.log('Could not refresh capability value', err),
      );

      // Notification listener
      this.registerReportListener('NOTIFICATION', 'NOTIFICATION_REPORT', this.onNotificationReport.bind(this));

      // Keep the persisted active alarm synchronized with alarm_generic.
      await this.setNotification(this.getCapabilityValue('notification'), true);
    }

    async initMigration() {
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

    async onNotificationReport(report) {
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
     * Set state capability and trigger flows
     * @param {string} state
     * @param {boolean} silent
     */
    setState(state, silent = false) {
      const operation = this._stateUpdateQueue.then(
        () => this._applyState(state, silent),
      );
      this._stateUpdateQueue = operation.catch(() => {});
      return operation;
    }

    async _applyState(state, silent) {
      // State is same, as what we want set
      if (this.getCapabilityValue('state') === state) {
        return;
      }

      // Reset notification on closed (closing is passed wrongly sometimes)
      if (STATE_CLOSED === state) {
        await this.setNotification(null);
      }

      await this.setCapabilityValue('state', state);

      // If no silent mode for init, trigger
      if (!silent) {
        await this.driver.stateChangedTrigger.trigger(this, { state });
      }
    }

    /**
     * Set notification capability and trigger flows
     * @param {string|null} notification
     * @param {boolean} silent
     */
    setNotification(notification, silent = false) {
      const operation = this._notificationUpdateQueue.then(
        () => this._applyNotification(notification, silent),
      );
      this._notificationUpdateQueue = operation.catch(() => {});
      return operation;
    }

    async _applyNotification(notification, silent) {
      const currentValue = this.getCapabilityValue('notification');

      await Promise.all([
        this.setCapabilityValue('notification', notification),
        this.setCapabilityValue('alarm_generic', notification !== null),
      ]);

      // Notification is already there
      if (currentValue === notification) {
        return;
      }

      // If notification is set, and no silent mode for init, trigger
      if (notification !== null && !silent) {
        await this.driver.notificationReceivedTrigger.trigger(this, { notification });
      }
    }

    _registerLegacyOnOffCapability() {
      if (!this.hasCapability('onoff')) {
        return;
      }

      this.registerCapabilityListener('onoff', async (isOpen, opts) => {
        const isClosed = !isOpen;

        await this.triggerCapabilityListener('garagedoor_closed', isClosed, opts);
        await this.setCapabilityValue('garagedoor_closed', isClosed);
        await this._syncLegacyOnOff(isClosed);
      });
    }

    async _syncLegacyOnOff(isClosed) {
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
     * Set parser
     * @param value
     * @returns {{"Dimming Duration": string, Value: (string)}}
     * @private
     */
    _gateSetParser(value) {
      this.log('Set parser:', value);

      const state = this.getCapabilityValue('state');
      const shouldMove = value
        ? state !== STATE_CLOSED
        : state !== STATE_OPEN;

      if (shouldMove) {
        // set state, enable delayed state change
        this.setState(value ? STATE_CLOSING : STATE_OPENING).catch(
          (err) => this.error('Could not set commanded gate state', err),
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
     * Set delayed state change, this only perform action if _setDelayed is true
     * @param state
     * @private
     */
    async _setDelayedState(state) {
      this._clearMovementTiming();

      await this.setState(state);
    }

    _setTimerState(state) {
      this._clearTimerState();
      const time = this._getTimerTime();

      this.log('Set timer for: ', time);
      this._timerTargetState = state;
      this._timer = this.homey.setTimeout(() => {
        this._setDelayedState(state).catch(
          (err) => this.error('Could not set delayed gate state', err),
        );
      }, time);
      this._movementStartedAt = Date.now();
    }

    _getTimerTime() {
      if (this._movementStartedAt) {
        return Math.min((Date.now() + 1000) - this._movementStartedAt, this.getSetting('gate_state_timeout') || 10000);
      }
      return this.getSetting('gate_state_timeout') || 10000;
    }

    _clearTimerState() {
      if (this._timer) {
        this.log(`Clear timer id: ${this._timer}`);
        this.homey.clearTimeout(this._timer);
      }
      this._timer = null;
      this._timerTargetState = null;
    }

    _clearMovementTiming() {
      this._clearTimerState();
      this._movementStartedAt = null;
    }

    /**
     * Report parser for state detection
     * @param report
     * @private
     */
    _gateReportParser(report) {
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
        (err) => this.error('Could not set reported gate state', err),
      );

      return stateText === STATE_CLOSED || stateText === STATE_CLOSING;
    }

    onDeleted() {
      this._clearMovementTiming();
      return super.onDeleted();
    }

}

module.exports = BusT4Device;
