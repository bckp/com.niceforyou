'use strict';

const Homey = require('homey');

class NiceApp extends Homey.App {
  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('NICE has been initialized');
  }
}

module.exports = NiceApp;