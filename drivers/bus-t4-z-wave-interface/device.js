'use strict';

const { ZwaveDevice } = require('homey-meshdriver');

class BusT4Device extends ZwaveDevice {

	onMeshInit() {
		this.log('BusT4Device has been inited');

		this.enableDebug();

		this.registerCapability('onoff', 'SWITCH_MULTILEVEL');
		this.registerCapability('dim', 'SWITCH_MULTILEVEL');
	}

}

module.exports = BusT4Device;
