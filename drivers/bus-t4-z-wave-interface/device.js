'use strict';

const {ZwaveDevice} = require('homey-meshdriver');

const gateState = {
    0: 'closed',
    198: 'open',
    254: 'closing',
    353: 'opening',
    508: 'stopped',
}

const obstacleSource = {
    71: 'engine',
    72: 'beam',
    76: 'external',
}

const obstacleResetState = [
    gateState["0"],
    gateState["254"],
]

class BusT4Device extends ZwaveDevice {

    async onMeshInit() {
        this.log('BusT4Device has been inited');
        this.enableDebug();

        this.driver = this.getDriver();

        // Open/close the gate
        this.registerCapability('onoff', 'SWITCH_MULTILEVEL', {
            reportParser: this._gateReportParser.bind(this),
            reportParserOverride: true,
        });

        // Notification listener
        this.registerReportListener('NOTIFICATION', 'NOTIFICATION_REPORT', report => {
            this.log('Notification received', report);

            if (report && report.hasOwnProperty('Event') && Object.keys(obstacleSource).includes(report.Event)) {
                this.setNotification(obstacleSource[report.Event]);
            }
        });

        // State change listener
        this.registerCapabilityListener('state', state => {
            if (obstacleResetState.includes(state)) {
                this.setNotification(null);
            }

           return Promise.resolve();
        });

        // Reset notification
        await this.setCapabilityValue('notification', null);
    }

    /**
     * Set state capability and trigger flows
     * @param {string} state
     */
    setState(state) {
        this.setCapabilityValue('state', state).catch(
            err => this.log(`Could not set capability value for state`, err)
        )
        this.driver.stateChangedTrigger.trigger(this, {state: state});
    }

    /**
     * Set notification capability and trigger flows
     * @param {string|null} notification
     */
    setNotification(notification) {
        this.setCapabilityValue('notification', notification).catch(
            err => this.log(`Could not set capability value for notification`, err)
        )
    }

    /**
     * Report parser for state detection
     * @param report
     * @private
     */
    _gateReportParser(report) {
        this.log('Gate report received', report);

        if (report
            && report.hasOwnProperty('Current Value (Raw)')
            && report.hasOwnProperty('Target Value (Raw)')
        ) {
            // Read value from RAW (parsed is wrong time to time)
            const currentValue = report['Current Value (Raw)'].readUInt8();
            const targetValue = report['Target Value (Raw)'].readUInt8();

            // Calculate stateCode and stateText
            const stateCode = currentValue + targetValue;
            const stateText = gateState[stateCode];

            this.log(`Gate status ${stateCode}, parsed: ${stateText}`);

            // Change state only if real change occur
            if (this.getCapabilityValue('state') !== stateText) {
                this.setState(stateText);
            }

            return stateCode !== 0;
        }
    }
}

module.exports = BusT4Device;
