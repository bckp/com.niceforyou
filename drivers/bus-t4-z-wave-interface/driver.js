'use strict';

const Homey = require('homey');

class BusT4Driver extends Homey.Driver {

  onInit() {
    super.onInit();

    this.stateChangedTrigger = new Homey.FlowCardTriggerDevice('bus_t4_state_changed').register();
    this.notificationReceivedTrigger = new Homey.FlowCardTriggerDevice('bus_t4_notification_received').register();
  }

}

module.exports = BusT4Driver;
