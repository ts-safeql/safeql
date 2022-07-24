declare module "prexit" {
  export default function prexit(fn: () => void);
  export default function prexit(
    signals:
      | "beforeExit"
      | "uncaughtException"
      | "SIGTSTP"
      | "SIGQUIT"
      | "SIGHUP"
      | "SIGTERM"
      | "SIGINT",
    fn: () => void
  );
}
