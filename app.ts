import Homey from 'homey';

class NiceApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  override async onInit(): Promise<void> {
    this.log('NICE has been initialized');
  }

}

export = NiceApp;
