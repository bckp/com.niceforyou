'use strict';

const Homey = require('homey');

class BusT4Driver extends Homey.Driver {

  onInit() {
    super.onInit();

    this.stateChangedTrigger = this.homey.flow.getDeviceTriggerCard('bus_t4_state_changed');
    this.notificationReceivedTrigger = this.homey.flow.getDeviceTriggerCard('bus_t4_notification_received');
  }
}

module.exports = BusT4Driver;
