import Homey from 'homey';
import type { GateState } from '../../lib/nice-protocol';

interface GateIsArgs {
  device: Homey.Device;
  state: GateState;
}

interface GateIsBlockedArgs {
  device: Homey.Device;
}

class BusT4Driver extends Homey.Driver {

  stateChangedTrigger!: Homey.FlowCardTriggerDevice;
  notificationReceivedTrigger!: Homey.FlowCardTriggerDevice;
  conditionGateIs!: Homey.FlowCardCondition;
  conditionGateIsBlocked!: Homey.FlowCardCondition;

  override async onInit(): Promise<void> {
    // Triggers
    this.stateChangedTrigger = this.homey.flow.getDeviceTriggerCard('bus_t4_state_changed');
    this.notificationReceivedTrigger = this.homey.flow.getDeviceTriggerCard('bus_t4_notification_received');

    // Conditions
    this.conditionGateIs = this.homey.flow.getConditionCard('gate-is');
    this.conditionGateIsBlocked = this.homey.flow.getConditionCard('gate-is-blocked');

    this.conditionGateIs.registerRunListener(
      ({ device, state }: GateIsArgs) => device.getCapabilityValue('state') === state,
    );
    this.conditionGateIsBlocked.registerRunListener(
      ({ device }: GateIsBlockedArgs) => device.getCapabilityValue('notification') !== null,
    );
  }

}

export = BusT4Driver;
