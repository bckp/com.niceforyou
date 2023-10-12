'use strict';

const { ZwaveDevice } = require('homey-zwavedriver');

const STATE_OPEN = 'open';
const STATE_CLOSED = 'closed';
const STATE_OPENING = 'opening';
const STATE_CLOSING = 'closing';
const STATE_STOPPED = 'stopped';

const GATE_STATE = {
  0: STATE_CLOSED,
  198: STATE_OPEN,
  254: STATE_CLOSING,
  353: STATE_OPENING,
  508: STATE_STOPPED,
};

const OBSTACLE_SOURCE = {
  71: 'engine',
  72: 'beam',
  76: 'external',
};

class BusT4Device extends ZwaveDevice {

    _elapsed = null;
    _timer = null;

    async onNodeInit({ node }) {
      this.log('BusT4Device has been initialized');
      this.enableDebug();

      this.initMigration();

      // Capabilities
      this.registerCapability('garagedoor_closed', 'SWITCH_MULTILEVEL', {
        get: 'SWITCH_MULTILEVEL_GET',
        set: 'SWITCH_MULTILEVEL_SET',
        report: 'SWITCH_MULTILEVEL_REPORT',
        reportParserOverride: true,
        getOnStart: true,
        setParser: this._gateSetParser.bind(this),
        reportParser: this._gateReportParser.bind(this),
      });

      // Refresh state
      this.refreshCapabilityValue('garagedoor_closed', 'SWITCH_MULTILEVEL').catch(
        (err) => this.log('Could not refresh capability value', err),
      );

      // Notification listener
      this.registerReportListener('NOTIFICATION', 'NOTIFICATION_REPORT', this.onNotificationReport.bind(this));

      // And conditions
      this.driver.conditionGateIs.registerRunListener(async ({ state }) => this.getCapabilityValue('state') === state);
      this.driver.conditionGateIsBlocked.registerRunListener(async () => this.getCapabilityValue('notification') !== null);

      // Set capabilities from current state
      this.setNotification(null, true);
    }

    async initMigration() {
      // Check if already migrated
      if (this.getClass() === 'garagedoor') {
        return;
      }

      // Set class
      this.log(`Changing class on ${this.getName()} from ${this.getClass()} to garagedoor`);
      this.setClass('garagedoor');

      // Capabilities
      if (!this.hasCapability('alarm_generic')) {
        this.addCapability('alarm_generic');
      }
      if (!this.hasCapability('garagedoor_closed')) {
        this.addCapability('garagedoor_closed');
      }
      if (this.hasCapability('onoff')) {
        this.removeCapability('onoff');
      }
    }

    async onNotificationReport(report) {
      this.log('Notification received', report);

      if (report && Object.prototype.hasOwnProperty.call(report, 'Event') && Object.keys(OBSTACLE_SOURCE).includes(report.Event.toString())) {
        this.setNotification(OBSTACLE_SOURCE[report.Event]);
      }
    }

    /**
     * Set state capability and trigger flows
     * @param {string} state
     * @param {boolean} silent
     */
    setState(state, silent = false) {
      // Clear timer if set
      this._clearTimerState();

      // State is same, as what we want set
      if (this.getCapabilityValue('state') === state) {
        return;
      }

      // Reset notification on closed (closing is passed wrongly sometimes)
      if (STATE_CLOSED === state) {
        this.setNotification(null);
      }

      this.setCapabilityValue('state', state).catch(
        (err) => this.log('Could not set capability value for state', err),
      );

      // If no silent mode for init, trigger
      if (!silent) {
        this.driver.stateChangedTrigger.trigger(this, { state }).catch(
          (err) => this.log('Failed to trigger notificationReceivedTrigger', err),
        );
      }
    }

    /**
     * Set notification capability and trigger flows
     * @param {string|null} notification
     * @param {boolean} silent
     */
    setNotification(notification, silent = false) {
      const currentValue = this.getCapabilityValue('notification');

      this.setCapabilityValue('notification', notification).catch(
        (err) => this.log('Could not set capability value for notification', err),
      );
      this.setCapabilityValue('alarm_generic', notification !== null).catch(
        (err) => this.log('Could not set capability value for alarm_generic', err),
      );

      // Notification is already there
      if (currentValue === notification) {
        return;
      }

      // If notification is set, and no silent mode for init, trigger
      if (notification !== null && !silent) {
        this.driver.notificationReceivedTrigger.trigger(this, { notification }).catch(
          (err) => this.log('Failed to trigger notificationReceivedTrigger', err),
        );
      }
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
      if (
        (value && state !== STATE_OPEN)
            || (!value && state !== STATE_CLOSED)
      ) {
        // set state, enable delayed state change
        this.setState(value ? STATE_OPENING : STATE_CLOSING);

        // set timeout by user setting value, to change state again
        this._setTimerState(value ? STATE_OPEN : STATE_CLOSED);
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
    _setDelayedState(state) {
      this._clearTimerState();
      this._clearTimerElapsed();

      this.setState(state);
    }

    _setTimerState(state) {
      this._clearTimerState();
      const time = this._getTimerTime();

      this.log('Set timer for: ', time);
      this._timer = this.homey.setTimeout(() => this._setDelayedState(state), time);
      this._elapsed = new Date().getTime();
    }

    _getTimerTime() {
      if (this._elapsed) {
        return Math.min((new Date().getTime() + 1000) - this._elapsed, this.getSetting('gate_state_timeout') || 10000);
      }
      return this.getSetting('gate_state_timeout') || 10000;
    }

    _clearTimerState() {
      if (this._timer) {
        this.log(`Clear timer id: ${this._timer}`);
        this.homey.clearTimeout(this._timer);
      }
      this._timer = null;
    }

    _clearTimerElapsed() {
      this._elapsed = null;
    }

    /**
     * Report parser for state detection
     * @param report
     * @private
     */
    _gateReportParser(report) {
      this.log('Gate report received', report);

      if (report
            && Object.prototype.hasOwnProperty.call(report, 'Current Value (Raw)')
            && Object.prototype.hasOwnProperty.call(report, 'Target Value (Raw)')
      ) {
        // Read value from RAW (parsed is wrong time to time)
        const currentValue = report['Current Value (Raw)'].readUInt8();
        const targetValue = report['Target Value (Raw)'].readUInt8();

        // Calculate stateCode and stateText
        const stateCode = currentValue + targetValue;
        const stateText = GATE_STATE[stateCode];

        this.log(`Gate status ${stateCode}, parsed: ${stateText}`);

        // Change state only if real change occur
        this.setState(stateText);

        // STATE_CLOSED || STATE_CLOSING
        return stateCode === 0 || stateCode === 254;
      }

      return null;
    }

}

module.exports = BusT4Device;
