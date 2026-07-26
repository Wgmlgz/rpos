///<reference path="./lib/extension.ts"/>
interface rposConfig {
  NetworkAdapters: string[];
  IpAddress: string;
  ServicePort: number;
  Username: string;
  Password: string;
  CameraType: string;
  CameraDevice: string;
  RTSPAddress: string;
  RTSPPort: number;
  RTSPName: string;
  RTSPServer: number;
  MulticastEnabled: boolean;
  RTSPMulticastName : string;
  MulticastAddress: string;
  MulticastPort: number;
  PTZDriver: string;
  PTZOutput: string;
  PTZSerialPort: string;
  PTZSerialPortSettings: PTZSerialPortSettings;
  PTZOutputURL: string;
  PTZCameraAddress: number;
  DeviceInformation: DeviceInformation;
  logLevel: number;
  logSoapCalls: Boolean;
  UnrealAuthoritativePtz?: UnrealAuthoritativePtzConfig;
}

interface UnrealAuthoritativePtzConfig {
  SocketIoPort?: number;
  TickRateHz?: number;
  InitialPan?: number;
  InitialTilt?: number;
  InitialZoom?: number;
  PanDelayMs?: number;
  TiltDelayMs?: number;
  ZoomDelayMs?: number;
  // Delay before ONVIF MoveStatus changes from IDLE to MOVING. This status
  // clock is distinct from the physical pose-delay values above.
  PanTiltStatusMovingDelayMs?: number;
  ZoomStatusMovingDelayMs?: number;
  // Extra time PanTilt remains MOVING after its physical target is reached.
  PanTiltStatusSettleMs?: number;
  PanDurationSlopeMs?: number;
  TiltDurationSlopeMs?: number;
  ZoomDurationSlopeMs?: number;
  PanDurationInterceptMs?: number;
  TiltDurationInterceptMs?: number;
  ZoomDurationInterceptMs?: number;
  ContinuousPanUnitsPerSecond?: number;
  ContinuousTiltUnitsPerSecond?: number;
  ContinuousZoomUnitsPerSecond?: number;
  // These are the original RposConnect calibration endpoints.  They map the
  // ONVIF-normalized [-1, +1] axes to physical camera-head degrees.
  PanDegreesAtMinusOne?: number;
  PanDegreesAtPlusOne?: number;
  TiltDegreesAtMinusOne?: number;
  TiltDegreesAtPlusOne?: number;
  WideHorizontalFovDegrees?: number;
  TeleHorizontalFovDegrees?: number;
}

interface PTZSerialPortSettings {
  baudRate: number;
  dataBits: number;
  parity: string;
  stopBits: number;
}

interface DeviceInformation {
  Manufacturer: string;
  Model: string;
  HardwareId: string;
  SerialNumber: string;
  FirmwareVersion: string;
}

interface TypeConstructor extends Function {
  name: string;
}

interface SoapServiceOptions {
  path: string,
  services: any,
  xml: any,
  wsdlPath: string,
  onReady: () => void;
}

interface Date {
  stdTimezoneOffset: () => number;
  dst: () => boolean;
}

interface UserControlOptions<T> {
  stringify?: (T) => string,
  range?: {
    min: T,
    max: T,
    allowZero?: boolean,
    step?: T
  }
  lookupSet?: UserControlsLookupSet<T>;
}

interface UserControlsLookup<T> {
  value: T;
  desc: string;
}
interface UserControlsLookupSet<T> extends Array<UserControlsLookup<T>> {

}

interface Resolution {
  Width: number;
  Height: number;
}
interface CameraSettingsParameter {
  gop: number; //keyframe every X sec.
  resolution: Resolution;
  framerate: number;
  bitrate: number;
  profile: string;
  quality: number;
}
interface CameraSettingsBase {
  forceGop: boolean; // Use iframe interval setting from v4l2ctl.json instead of Onvif
  resolution: Resolution;
  framerate: number;
}
