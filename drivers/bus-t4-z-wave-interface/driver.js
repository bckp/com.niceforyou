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

    // Conditions - deprecated
    this.conditionGateIsClosing = this.homey.flow.getConditionCard('gate-is-closing');
    this.conditionGateIsOpening = this.homey.flow.getConditionCard('gate-is-opening');
    this.conditionGateIsOpen = this.homey.flow.getConditionCard('gate-is-open');
    this.conditionGateIsClosed = this.homey.flow.getConditionCard('gate-is-closed');
  }

}

module.exports = BusT4Driver;
