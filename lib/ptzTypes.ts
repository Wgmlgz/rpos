/// <reference path="../rpos.d.ts"/>

export type PtzCommand =
  | { type: 'gotohome' }
  | { type: 'sethome' }
  | { type: 'gotopreset'; presetName: string; presetValue: string }
  | { type: 'setpreset'; presetName: string; presetValue: string }
  | { type: 'clearpreset'; presetName: string; presetValue: string }
  | { type: 'aux'; name: string }
  | { type: 'relayactive'; name: string }
  | { type: 'relayinactive'; name: string }
  | { type: 'ptz'; pan: number; tilt: number; zoom: number }
  | { type: 'absolute-ptz'; pan: number; tilt: number; zoom: number }
  | { type: 'relative-ptz'; pan: number; tilt: number; zoom: number }
  | { type: 'brightness'; value: number }
  | { type: 'focus'; value: number }
  | { type: 'focusstop' }
  | { type: 'unknown'; raw: string };




export type MoveStatusEnum = "IDLE" | "MOVING" | "UNKNOWN"
export type PtzStatus = {
  Position: {
    PanTilt: {
      x: number,
      y: number
    },
    Zoom: {
      x: number,
    }
  },
  MoveStatus: {
    PanTilt: MoveStatusEnum,
    Zoom: MoveStatusEnum
  }
}