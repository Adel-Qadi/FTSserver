import type { MigrationConfig } from "drizzle-orm/migrator";

process.loadEnvFile();

export const migrationConfig: MigrationConfig = {
  migrationsFolder: "./src/db/migrations",
};

type APIConfig = {
  fileserverHits: number;
  port: number;
  platform : string;
  polkaKey : string;
};
type DBConfig = {
  url: string;
  migrationConfig: MigrationConfig;
};
export const config = {
  api: {
    fileserverHits: 0,
    port: Number(process.env.PORT),
    platform: process.env.PLATFORM || "",
    polkaKey: process.env.POLKA_KEY || "",
  } satisfies APIConfig,
  db: {
    url: process.env.DB_URL || "",
    migrationConfig,
  } satisfies DBConfig,
  jwtSecret: process.env.JWT_SECRET || "",
};



export default config;

