'use strict';

const Homey = require('homey');

class BusT4Driver extends Homey.Driver {

  onInit() {
    super.onInit();

    this.stateChangedTrigger = new Homey.FlowCardTriggerDevice('bus_t4_gate_state_changed').register();
    this.notificationChangedTrigger = new Homey.FlowCardTriggerDevice('bus_t4_gate_notification_changed').register();
  }

}

module.exports = BusT4Driver;
