import { buildServer } from "./server";

interface CliArgs {
  port: number;
  dataDir: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: 3001, dataDir: "./data" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") {
      args.port = parseInt(argv[++i], 10);
    } else if (a === "--data-dir") {
      args.dataDir = argv[++i];
    } else if (a === "-h" || a === "--help") {
      console.log(
        "Usage: autolearn-sync-server [--port 3001] [--data-dir ./data]",
      );
      process.exit(0);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const app = await buildServer({ dataDir: args.dataDir, logger: true });

try {
  await app.listen({ port: args.port, host: "0.0.0.0" });
  app.log.info(
    `autolearn-sync-server listening on :${args.port}, data dir ${args.dataDir}`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
