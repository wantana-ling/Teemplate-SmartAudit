declare module 'guacamole-common-js' {
  export class Client {
    constructor(tunnel: Tunnel);
    connect(data?: string): void;
    disconnect(): void;
    getDisplay(): Display;
    sendKeyEvent(pressed: boolean, keysym: number): void;
    sendMouseState(mouseState: Mouse.State): void;
    onerror?: (status: Status) => void;
    onstatechange?: (state: number) => void;
    onclipboard?: (stream: InputStream, mimetype: string) => void;
  }

  export class Display {
    getElement(): HTMLElement;
    getWidth(): number;
    getHeight(): number;
    scale(scale: number): void;
    resize(width: number, height: number): void;
    flatten(): void;
    flush(): void;
    getDefaultLayer(): VisibleLayer;
    createLayer(): VisibleLayer;
    onresize?: (width: number, height: number) => void;
  }

  export class VisibleLayer {
    resize(width: number, height: number): void;
    drawImage(x: number, y: number, image: HTMLCanvasElement | HTMLImageElement): void;
  }

  export class Tunnel {
    state: number;
    uuid: string | null;
    receiveTimeout: number;
    unstable: boolean;
    connect(data?: string): void;
    disconnect(): void;
    sendMessage(...elements: any[]): void;
    isConnected(): boolean;
    onerror?: (status: Status) => void;
    onstatechange?: (state: number) => void;
    oninstruction?: (opcode: string, parameters: string[]) => void;

    static State: {
      CONNECTING: number;
      OPEN: number;
      CLOSED: number;
      UNSTABLE: number;
    };
  }

  export class WebSocketTunnel extends Tunnel {
    constructor(url: string);
  }

  export class HTTPTunnel extends Tunnel {
    constructor(url: string);
  }

  export class StaticHTTPTunnel extends Tunnel {
    constructor(url: string);
  }

  export class ChainedTunnel extends Tunnel {
    constructor(...tunnels: Tunnel[]);
  }

  export class Status {
    code: number;
    message: string;
    isError(): boolean;
    static Code: {
      SUCCESS: number;
      UNSUPPORTED: number;
      SERVER_ERROR: number;
      SERVER_BUSY: number;
      UPSTREAM_TIMEOUT: number;
      UPSTREAM_ERROR: number;
      RESOURCE_NOT_FOUND: number;
      RESOURCE_CONFLICT: number;
      RESOURCE_CLOSED: number;
      UPSTREAM_NOT_FOUND: number;
      UPSTREAM_UNAVAILABLE: number;
      SESSION_CONFLICT: number;
      SESSION_TIMEOUT: number;
      SESSION_CLOSED: number;
      CLIENT_BAD_REQUEST: number;
      CLIENT_UNAUTHORIZED: number;
      CLIENT_FORBIDDEN: number;
      CLIENT_TIMEOUT: number;
      CLIENT_OVERRUN: number;
      CLIENT_BAD_TYPE: number;
      CLIENT_TOO_MANY: number;
    };
  }

  export class InputStream {
    onblob?: (data: string) => void;
    onend?: () => void;
    sendAck(status: Status): void;
  }

  export class OutputStream {
    sendBlob(data: string): void;
    sendEnd(): void;
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
      onmousedown?: (state: State) => void;
      onmouseup?: (state: State) => void;
      onmousemove?: (state: State) => void;
    }

    export class Touchscreen {
      constructor(element: HTMLElement);
      onmousedown?: (state: State) => void;
      onmouseup?: (state: State) => void;
      onmousemove?: (state: State) => void;
    }
  }

  export class Keyboard {
    constructor(element: HTMLElement | Document);
    onkeydown?: (keysym: number) => boolean | void;
    onkeyup?: (keysym: number) => void;
    press(keysym: number): void;
    release(keysym: number): void;
    reset(): void;
  }

  export class Parser {
    receive(data: string): void;
    oninstruction?: (opcode: string, args: string[]) => void;
  }

  export class SessionRecording {
    constructor(tunnel: Tunnel);
    connect(data?: string): void;
    disconnect(): void;
    getDisplay(): Display;
    getPosition(): number;
    getDuration(): number;
    isPlaying(): boolean;
    play(): void;
    pause(): void;
    seek(position: number, callback?: () => void): void;
    onload?: () => void;
    onplay?: () => void;
    onpause?: () => void;
    onseek?: (position: number) => void;
    onprogress?: (duration: number) => void;
    onerror?: (message: string) => void;
  }

  export class AudioPlayer {
    static supported: string[];
    static getInstance(stream: InputStream, mimetype: string): AudioPlayer | null;
    sync(): void;
  }

  export class VideoPlayer {
    static supported: string[];
    static getInstance(stream: InputStream, layer: VisibleLayer, mimetype: string): VideoPlayer | null;
  }

  export const KEYMOD_SHIFT: number;
  export const KEYMOD_CTRL: number;
  export const KEYMOD_ALT: number;
  export const KEYMOD_META: number;
  export const KEYMOD_HYPER: number;
}
