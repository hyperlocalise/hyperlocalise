import { db } from "@/lib/database";
import { createLogger, type Logger } from "@/lib/log";

/**
 * Shared foundation for project domain services: injectable database access
 * and a namespaced logger for structured, PII-safe operational logging.
 */
export abstract class ProjectServiceBase {
  protected readonly log: Logger;

  constructor(
    protected readonly database: typeof db = db,
    namespace: string,
  ) {
    this.log = createLogger(namespace);
  }
}
