/**
 * Minimal type declarations for homey-zwavedriver, which ships without types.
 * Only the surface used by this app is declared; extend as needed.
 */
declare module 'homey-zwavedriver' {
  import Homey from 'homey';

  export type ZwaveSetParser = (value: any, opts?: any) => object | null | Error | Promise<any>;
  export type ZwaveReportParser = (report: any) => any;

  export interface ZwaveCapabilityGetOptions {
    getOnStart?: boolean;
    getOnOnline?: boolean;
    pollInterval?: number | string;
    pollMultiplication?: number;
  }

  export interface ZwaveCapabilitySetOptions {
    /** Called (on next tick) after a capability SET has been resolved. */
    fn?: (value: any, opts?: any) => void;
  }

  export interface ZwaveCapabilityReportOptions {
    /** Called after a REPORT has been parsed and the capability value set. */
    fn?: (parsedPayload: any) => void;
  }

  export interface ZwaveCapabilityOptions {
    get?: string;
    getOpts?: ZwaveCapabilityGetOptions;
    /** @deprecated use getOpts.getOnStart */
    getOnStart?: boolean;
    /** @deprecated use getOpts.getOnOnline */
    getOnOnline?: boolean;
    /** @deprecated use getOpts.pollInterval */
    pollInterval?: number | string;
    set?: string;
    setParser?: ZwaveSetParser;
    setParserV1?: ZwaveSetParser;
    setParserV2?: ZwaveSetParser;
    setParserV3?: ZwaveSetParser;
    setParserV4?: ZwaveSetParser;
    setOpts?: ZwaveCapabilitySetOptions;
    report?: string;
    reportParser?: ZwaveReportParser;
    reportParserV1?: ZwaveReportParser;
    reportParserV2?: ZwaveReportParser;
    reportParserV3?: ZwaveReportParser;
    reportParserV4?: ZwaveReportParser;
    reportParserOverride?: boolean;
    reportOpts?: ZwaveCapabilityReportOptions;
    multiChannelNodeId?: number;
  }

  export type ZwaveReportListener = (report: any, parsedPayload?: any) => void;

  export class ZwaveDevice extends Homey.Device {
    node: Homey.ZwaveNode;

    /** Called once the Z-Wave node has been initialised. */
    onNodeInit(args: { node: Homey.ZwaveNode }): Promise<void> | void;
    /** @deprecated legacy from homey-meshdriver */
    onMeshInit(): void;

    registerCapability(capabilityId: string, commandClassId: string, userOpts?: ZwaveCapabilityOptions): void;
    registerSetting(settingId: string, parserFn: (value: any, zwaveObj: any) => Buffer | number | boolean): void;
    registerReportListener(commandClassId: string, commandId: string, triggerFn: ZwaveReportListener): void;
    registerMultiChannelReportListener(
      multiChannelNodeId: number,
      commandClassId: string,
      commandId: string,
      triggerFn: ZwaveReportListener,
    ): void;

    refreshCapabilityValue(capabilityId: string, commandClassId: string): Promise<any>;
    executeCapabilitySetCommand(capabilityId: string, commandClassId: string, value: any, opts?: object): Promise<any>;

    hasCommandClass(commandClassId: string, opts?: { multiChannelNodeId?: number }): boolean;
    getCommandClass(commandClassId: string, opts?: { multiChannelNodeId?: number }): Homey.ZwaveCommandClass | Error;
    getMultiChannelNodeIdsByDeviceClassGeneric(deviceClassGeneric: string): number[];

    configurationSet(options: { index?: number; size?: number; id?: string; signed?: boolean; useSettingParser?: boolean }, value: any): Promise<any>;
    configurationGet(options: { index: number }): Promise<any>;
    meterReset(options?: { multiChannelNodeId?: number }): Promise<any>;

    getManifestSettings(): any[];
    getManifestSetting(id: string): any | Error;

    printNodeSummary(): void;
    printNode(): void;
    enableDebug(): void;
    disableDebug(): void;
  }

  export class ZwaveLightDevice extends ZwaveDevice {}
}
