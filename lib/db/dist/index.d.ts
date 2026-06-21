import pg from "pg";
import * as schema from "./schema";
export declare const pool: any;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("drizzle-orm/node-postgres").NodePgClient extends TClient ? pg : TClient;
};
export * from "./schema";
//# sourceMappingURL=index.d.ts.map