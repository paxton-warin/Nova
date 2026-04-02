/// <reference types="vite/client" />

declare const $scramjetLoadController: () => {
  ScramjetController: new (config: {
    prefix?: string;
    files: {
      wasm: string;
      all: string;
      sync: string;
    };
  }) => {
    init: () => Promise<void>;
    createFrame: (frame?: HTMLIFrameElement) => {
      frame: HTMLIFrameElement;
      go: (url: string | URL) => void;
      back: () => void;
      forward: () => void;
      reload: () => void;
    };
    encodeUrl: (url: string | URL) => string;
  };
};

declare global {
  interface Window {
    BareMux: {
      BareMuxConnection: new (workerPath: string) => {
        getTransport: () => Promise<string | null>;
        setTransport: (path: string, args: unknown[]) => Promise<void>;
      };
    };
  }
}
