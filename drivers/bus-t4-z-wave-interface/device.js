'use strict';

const { ZwaveDevice } = require('homey-meshdriver');

class BusT4Device extends ZwaveDevice {

	onMeshInit() {
		this.log('BusT4Device has been inited');

		this.enableDebug();

		// Open/close the gate
		this.registerCapability('onoff', 'SWITCH_MULTILEVEL');

		// Controls how far the gate should open
		this.registerCapability('dim', 'SWITCH_MULTILEVEL', {setParserV4(value, options) {
			// Buffer.from() is a fix for difference between V3/V4 dimming duration XML specification
			const duration = (options.hasOwnProperty('duration') ? Buffer.from([util.calculateZwaveDimDuration(options.duration)]) : FACTORY_DEFAULT_DIMMING_DURATION_V4);
			if (this.hasCapability('onoff')) this.setCapabilityValue('onoff', value > 0);
				return {
					Value: Math.round(value * 254),
					'Dimming Duration': duration,
				};
			},
			reportParser: report => {
				if (report && report.hasOwnProperty('Current Value (Raw)')) {
					if (this.hasCapability('onoff')) this.setCapabilityValue('onoff', report['Current Value (Raw)'][0] > 0);
					if (report['Current Value (Raw)'][0] === 255) return 1;
					return report['Current Value (Raw)'][0] / 254;
				}
				return null;
			}
		});
	}

}

module.exports = BusT4Device;
