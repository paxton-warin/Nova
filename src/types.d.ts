declare module "@mercuryworkshop/wisp-js/server" {
  export const logging: {
    NONE: number;
    set_level: (level: number) => void;
  };

  export const server: {
    options: Record<string, unknown>;
    routeRequest: (req: unknown, socket: unknown, head: unknown) => void;
  };
}

declare module "better-sqlite3-session-store" {
  const factory: (session: unknown) => new (options: unknown) => unknown;
  export default factory;
}
