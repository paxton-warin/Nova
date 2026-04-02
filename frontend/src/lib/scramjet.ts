import type { TransportConfig } from "@/types/browser";

type ScramjetControllerCtor = new (config: {
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

type BareMuxConnection = {
  getTransport: () => Promise<string | null>;
  setTransport: (path: string, args: unknown[]) => Promise<void>;
};

const ERUDA_SOURCE_URL = "https://cdn.jsdelivr.net/npm/eruda/eruda.min.js";

let scramjetInitPromise:
  | Promise<InstanceType<ScramjetControllerCtor>>
  | null = null;
let serviceWorkerPromise: Promise<ServiceWorkerRegistration> | null = null;
let transportPromise: Promise<void> | null = null;
let lastTransportKey = "";
let erudaSourcePromise: Promise<string> | null = null;

function getBareMuxApi() {
  return (window as typeof window & {
    BareMux?: {
      BareMuxConnection: new (workerPath: string) => BareMuxConnection;
    };
  }).BareMux;
}

function createServiceWorkerError() {
  if (
    location.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(location.hostname)
  ) {
    return new Error("Service workers cannot be registered without https.");
  }
  return new Error("Your browser doesn't support service workers.");
}

export async function registerScramjetServiceWorker() {
  if (serviceWorkerPromise) {
    return serviceWorkerPromise;
  }

  serviceWorkerPromise = (async () => {
    if (!navigator.serviceWorker) {
      throw createServiceWorkerError();
    }

    const registration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
    void registration.update();
    return registration;
  })().catch((error) => {
    serviceWorkerPromise = null;
    throw error;
  });

  return serviceWorkerPromise;
}

async function configureTransport(config: TransportConfig) {
  const key = `${config.transportPath}|${config.wispUrl}|${config.proxyUrl ?? ""}`;
  if (transportPromise && lastTransportKey === key) {
    return transportPromise;
  }

  lastTransportKey = key;
  transportPromise = (async () => {
    const bareMux = getBareMuxApi();
    if (!bareMux?.BareMuxConnection) {
      throw new Error("BareMux is not available.");
    }

    const connection = new bareMux.BareMuxConnection(
      config.baremuxWorker,
    ) as BareMuxConnection;
    const transportArgs: { websocket: string; proxy?: string } = {
      websocket: config.wispUrl,
    };
    if (config.proxyUrl) {
      transportArgs.proxy = config.proxyUrl;
    }
    await connection.setTransport(config.transportPath, [transportArgs]);
  })().catch((error) => {
    transportPromise = null;
    lastTransportKey = "";
    throw error;
  });

  return transportPromise;
}

export async function getScramjetController(config: TransportConfig) {
  if (!scramjetInitPromise) {
    scramjetInitPromise = (async () => {
      if (typeof $scramjetLoadController !== "function") {
        throw new Error("Scramjet scripts are not available.");
      }

      const { ScramjetController } = $scramjetLoadController();
      const controller = new ScramjetController({
        prefix: "/scramjet/",
        files: config.scramjet,
      });

      await controller.init();
      await registerScramjetServiceWorker();

      return controller;
    })().catch((error) => {
      scramjetInitPromise = null;
      throw error;
    });
  }

  const controller = await scramjetInitPromise;
  await configureTransport(config);
  return controller;
}

async function getErudaSource() {
  if (erudaSourcePromise) {
    return erudaSourcePromise;
  }

  erudaSourcePromise = fetch(ERUDA_SOURCE_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load Eruda (${response.status})`);
      }
      const source = await response.text();
      if (source.trimStart().startsWith("<")) {
        throw new Error("Eruda CDN returned HTML instead of JavaScript.");
      }
      return source;
    })
    .catch((error) => {
      erudaSourcePromise = null;
      throw error;
    });

  return erudaSourcePromise;
}

export async function injectEruda(frame: HTMLIFrameElement): Promise<boolean> {
  try {
    const frameWindow = frame.contentWindow;
    const doc = frameWindow?.document;
    if (!doc || !frameWindow) return false;
    const frameEvaluator = frameWindow as Window & {
      eval: (source: string) => unknown;
      eruda?: {
        init?: () => void;
        show?: () => void;
      };
      __novaErudaInitialized?: boolean;
    };

    if (frameEvaluator.eruda?.show) {
      if (!frameEvaluator.__novaErudaInitialized) {
        frameEvaluator.eruda.init?.();
        frameEvaluator.__novaErudaInitialized = true;
      }
      frameEvaluator.eruda.show();
      return true;
    }

    const source = await getErudaSource();
    frameEvaluator.eval(source);
    if (!frameEvaluator.eruda) {
      throw new Error("Eruda did not attach to the proxied frame.");
    }
    if (!frameEvaluator.__novaErudaInitialized) {
      frameEvaluator.eruda.init?.();
      frameEvaluator.__novaErudaInitialized = true;
    }
    frameEvaluator.eruda.show?.();
    return true;
  } catch {
    return false;
  }
}
