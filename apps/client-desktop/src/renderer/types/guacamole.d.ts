declare module 'guacamole-common-js' {
  export class Client {
    constructor(tunnel: Tunnel);

    connect(data?: string): void;
    disconnect(): void;

    getDisplay(): Display;

    sendKeyEvent(pressed: number, keysym: number): void;
    sendMouseState(mouseState: Mouse.State): void;

    onstatechange: ((state: number) => void) | null;
    onerror: ((status: Status) => void) | null;
    onclipboard: ((stream: InputStream, mimetype: string) => void) | null;
    onfilesystem: ((object: any, name: string) => void) | null;
    onfile: ((stream: InputStream, mimetype: string, filename: string) => void) | null;
    onpipe: ((stream: InputStream, mimetype: string, name: string) => void) | null;
    onvideo: ((stream: InputStream, layer: any, mimetype: string) => void) | null;
    onaudio: ((stream: InputStream, mimetype: string) => void) | null;

    static State: {
      IDLE: 0;
      CONNECTING: 1;
      WAITING: 2;
      CONNECTED: 3;
      DISCONNECTING: 4;
      DISCONNECTED: 5;
    };
  }

  export class Tunnel {
    onerror: ((status: Status) => void) | null;
    oninstruction: ((opcode: string, parameters: string[]) => void) | null;
    onstatechange: ((state: number) => void) | null;

    sendMessage(...elements: any[]): void;
    connect(data?: string): void;
    disconnect(): void;

    static State: {
      CONNECTING: 0;
      OPEN: 1;
      CLOSED: 2;
    };
  }

  export class WebSocketTunnel extends Tunnel {
    constructor(url: string);
  }

  export class HTTPTunnel extends Tunnel {
    constructor(url: string, crossDomain?: boolean, extraTunnelHeaders?: Record<string, string>);
  }

  export class ChainedTunnel extends Tunnel {
    constructor(...tunnels: Tunnel[]);
  }

  export class Display {
    getElement(): HTMLElement;
    getWidth(): number;
    getHeight(): number;
    getScale(): number;

    scale(scale: number): void;
    showCursor(shown: boolean): void;
    setCursor(canvas: HTMLCanvasElement, x: number, y: number): void;

    onresize: ((width: number, height: number) => void) | null;
    oncursor: ((canvas: HTMLCanvasElement, x: number, y: number) => void) | null;
  }

  export class Keyboard {
    constructor(element: Document | HTMLElement);

    onkeydown: ((keysym: number) => void) | null;
    onkeyup: ((keysym: number) => void) | null;

    press(keysym: number): void;
    release(keysym: number): void;
    reset(): void;
  }

  export namespace Mouse {
    export class State {
      x: number;
      y: number;
      left: boolean;
      middle: boolean;
      right: boolean;
      up: boolean;
      down: boolean;
    }

    export class Touchpad {
      constructor(element: HTMLElement);

      onmousedown: ((state: State) => void) | null;
      onmouseup: ((state: State) => void) | null;
      onmousemove: ((state: State) => void) | null;
    }

    export class Touchscreen {
      constructor(element: HTMLElement);

      onmousedown: ((state: State) => void) | null;
      onmouseup: ((state: State) => void) | null;
      onmousemove: ((state: State) => void) | null;
    }
  }

  export class Mouse {
    constructor(element: HTMLElement);

    onmousedown: ((state: Mouse.State) => void) | null;
    onmouseup: ((state: Mouse.State) => void) | null;
    onmousemove: ((state: Mouse.State) => void) | null;

    static State: typeof Mouse.State;
    static Touchpad: typeof Mouse.Touchpad;
    static Touchscreen: typeof Mouse.Touchscreen;
  }

  export class Status {
    code: number;
    message: string;
    isError(): boolean;

    static Code: {
      SUCCESS: 0x0000;
      UNSUPPORTED: 0x0100;
      SERVER_ERROR: 0x0200;
      SERVER_BUSY: 0x0201;
      UPSTREAM_TIMEOUT: 0x0202;
      UPSTREAM_ERROR: 0x0203;
      RESOURCE_NOT_FOUND: 0x0204;
      RESOURCE_CONFLICT: 0x0205;
      RESOURCE_CLOSED: 0x0206;
      UPSTREAM_NOT_FOUND: 0x0207;
      UPSTREAM_UNAVAILABLE: 0x0208;
      SESSION_CONFLICT: 0x0209;
      SESSION_TIMEOUT: 0x020A;
      SESSION_CLOSED: 0x020B;
      CLIENT_BAD_REQUEST: 0x0300;
      CLIENT_UNAUTHORIZED: 0x0301;
      CLIENT_FORBIDDEN: 0x0303;
      CLIENT_TIMEOUT: 0x0308;
      CLIENT_OVERRUN: 0x030D;
      CLIENT_BAD_TYPE: 0x030F;
      CLIENT_TOO_MANY: 0x031D;
    };
  }

  export class InputStream {
    onblob: ((data: string) => void) | null;
    onend: (() => void) | null;
    sendAck(message: string, code: number): void;
  }

  export class OutputStream {
    onack: ((status: Status) => void) | null;
    sendBlob(data: string): void;
    sendEnd(): void;
  }

  export class StringReader {
    constructor(stream: InputStream);
    ontext: ((text: string) => void) | null;
    onend: (() => void) | null;
  }

  export class StringWriter {
    constructor(stream: OutputStream);
    sendText(text: string): void;
    sendEnd(): void;
  }

  export class BlobReader {
    constructor(stream: InputStream, mimetype: string);
    onend: (() => void) | null;
    onprogress: ((length: number) => void) | null;
    getBlob(): Blob;
  }

  export class BlobWriter {
    constructor(stream: OutputStream);
    onack: ((status: Status) => void) | null;
    oncomplete: ((blob: Blob) => void) | null;
    sendBlob(blob: Blob): void;
    sendEnd(): void;
  }

  export class AudioPlayer {
    static supported: string[];
    static getInstance(stream: InputStream, mimetype: string): AudioPlayer | null;
    sync(): void;
  }

  export class VideoPlayer {
    static supported: string[];
    static getInstance(stream: InputStream, layer: any, mimetype: string): VideoPlayer | null;
    sync(): void;
  }
}
