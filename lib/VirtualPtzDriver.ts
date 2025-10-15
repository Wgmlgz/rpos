/// <reference path="../rpos.d.ts"/>

/*
VirtualPtzDriver: parses RPOS ASCII PTZ lines written by PTZDriver into typed objects
and logs them. It implements a minimal write(data) API that PTZDriver uses as an output stream.

ASCII format (TAB separated, LF terminated):
  gotohome
  sethome
  gotopreset	presetname	presetvalue
  setpreset	presetname	presetvalue
  clearpreset	presetname	presetvalue
  aux	auxname
  relayactive	relayname
  relayinactive	relayname
  ptz	panspeed	tiltspeed	zoomspeed
  absolute-ptz	pan	tilt	zoom
  releative-ptz	pan	tilt	zoom
  brightness	value
  focus	direction
  focusstop
*/

type PtzCommand =
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

class VirtualPtzDriver {
  write(data: string|Buffer) {
    const line = Buffer.isBuffer(data) ? data.toString() : String(data);
    // PTZDriver writes with trailing \n; split just in case multiple lines are batched
    const lines = line.split(/\r?\n/).filter(l => l.length > 0);
    for (const ln of lines) {
      const parsed = this.parseLine(ln);
      console.log('[VirtualPtzDriver]', parsed);
    }
  }

  private parseLine(line: string): PtzCommand {
    const parts = line.split('\t');
    const cmd = parts[0];
    switch (cmd) {
      case 'gotohome':
        return { type: 'gotohome' };
      case 'sethome':
        return { type: 'sethome' };
      case 'gotopreset':
        return { type: 'gotopreset', presetName: parts[1] || '', presetValue: parts[2] || '' };
      case 'setpreset':
        return { type: 'setpreset', presetName: parts[1] || '', presetValue: parts[2] || '' };
      case 'clearpreset':
        return { type: 'clearpreset', presetName: parts[1] || '', presetValue: parts[2] || '' };
      case 'aux':
        return { type: 'aux', name: parts[1] || '' };
      case 'relayactive':
        return { type: 'relayactive', name: parts[1] || '' };
      case 'relayinactive':
        return { type: 'relayinactive', name: parts[1] || '' };
      case 'ptz':
        return { type: 'ptz', pan: this.toNum(parts[1]), tilt: this.toNum(parts[2]), zoom: this.toNum(parts[3]) };
      case 'absolute-ptz':
        return { type: 'absolute-ptz', pan: this.toNum(parts[1]), tilt: this.toNum(parts[2]), zoom: this.toNum(parts[3]) };
      case 'releative-ptz': // note historical misspelling in header comment; support both
      case 'relative-ptz':
        return { type: 'relative-ptz', pan: this.toNum(parts[1]), tilt: this.toNum(parts[2]), zoom: this.toNum(parts[3]) };
      case 'brightness':
        return { type: 'brightness', value: this.toNum(parts[1]) };
      case 'focus':
        return { type: 'focus', value: this.toNum(parts[1]) };
      case 'focusstop':
        return { type: 'focusstop' };
      default:
        return { type: 'unknown', raw: line };
    }
  }

  private toNum(v?: string): number {
    if (typeof v !== 'string') return 0;
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }
}

export = VirtualPtzDriver;

