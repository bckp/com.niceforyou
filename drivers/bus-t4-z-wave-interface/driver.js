'use strict';

const Homey = require('homey');

class BusT4Driver extends Homey.Driver {

  onInit() {
    super.onInit();

    // Triggers
    this.stateChangedTrigger = this.homey.flow.getDeviceTriggerCard('bus_t4_state_changed');
    this.notificationReceivedTrigger = this.homey.flow.getDeviceTriggerCard('bus_t4_notification_received');

    // Conditions
    this.conditionGateIs = this.homey.flow.getConditionCard('gate-is');
    this.conditionGateIsBlocked = this.homey.flow.getConditionCard('gate-is-blocked');

    this.conditionGateIs.registerRunListener(
      ({ device, state }) => device.getCapabilityValue('state') === state,
    );
    this.conditionGateIsBlocked.registerRunListener(
      ({ device }) => device.getCapabilityValue('notification') !== null,
    );
  }

}

module.exports = BusT4Driver;
