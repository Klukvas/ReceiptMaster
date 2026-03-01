import { MigrationService } from "./migration.service";

describe("MigrationService", () => {
  let service: MigrationService;
  let mockDataSource: any;
  let mockConfigService: any;
  let mockQueryRunner: any;
  let processExitSpy: jest.SpyInstance;

  /** Must match the private static constant in the implementation. */
  const MIGRATION_LOCK_ID = 3_217_891_453;

  beforeEach(() => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      runMigrations: jest.fn().mockResolvedValue([]),
    };

    mockConfigService = {
      get: jest.fn(),
    };

    processExitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => {}) as any);

    // Instantiate directly (same approach as cache.service.spec.ts) to avoid
    // complex DI token wiring in the test module.
    service = new (MigrationService as any)(mockDataSource, mockConfigService);
  });

  afterEach(() => {
    processExitSpy.mockRestore();
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // onApplicationBootstrap
  // ---------------------------------------------------------------------------
  describe("onApplicationBootstrap", () => {
    it("calls runWithAdvisoryLock when AUTO_RUN_MIGRATIONS is true", async () => {
      mockConfigService.get.mockReturnValue(true);

      await service.onApplicationBootstrap();

      expect(mockConfigService.get).toHaveBeenCalledWith("AUTO_RUN_MIGRATIONS");
      expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockDataSource.runMigrations).toHaveBeenCalled();
    });

    it("calls runWithAdvisoryLock when AUTO_RUN_MIGRATIONS is a truthy string", async () => {
      mockConfigService.get.mockReturnValue("true");

      await service.onApplicationBootstrap();

      expect(mockDataSource.runMigrations).toHaveBeenCalled();
    });

    it("does NOT call runWithAdvisoryLock when AUTO_RUN_MIGRATIONS is false", async () => {
      mockConfigService.get.mockReturnValue(false);

      await service.onApplicationBootstrap();

      expect(mockConfigService.get).toHaveBeenCalledWith("AUTO_RUN_MIGRATIONS");
      expect(mockDataSource.createQueryRunner).not.toHaveBeenCalled();
      expect(mockDataSource.runMigrations).not.toHaveBeenCalled();
    });

    it("does NOT call runWithAdvisoryLock when AUTO_RUN_MIGRATIONS is undefined", async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await service.onApplicationBootstrap();

      expect(mockDataSource.runMigrations).not.toHaveBeenCalled();
    });

    it("does NOT call runWithAdvisoryLock when AUTO_RUN_MIGRATIONS is null", async () => {
      mockConfigService.get.mockReturnValue(null);

      await service.onApplicationBootstrap();

      expect(mockDataSource.runMigrations).not.toHaveBeenCalled();
    });

    it("does NOT call runWithAdvisoryLock when AUTO_RUN_MIGRATIONS is empty string", async () => {
      mockConfigService.get.mockReturnValue("");

      await service.onApplicationBootstrap();

      expect(mockDataSource.runMigrations).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // runWithAdvisoryLock happy path
  // ---------------------------------------------------------------------------
  describe("runWithAdvisoryLock — happy path", () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue(true);
    });

    it("connects the query runner before any database work", async () => {
      const callOrder: string[] = [];
      mockQueryRunner.connect.mockImplementation(async () => {
        callOrder.push("connect");
      });
      mockQueryRunner.query.mockImplementation(async () => {
        callOrder.push("query");
      });
      mockDataSource.runMigrations.mockImplementation(async () => {
        callOrder.push("migrate");
        return [];
      });

      await service.onApplicationBootstrap();

      expect(callOrder[0]).toBe("connect");
    });

    it("acquires the advisory lock with the correct ID", async () => {
      await service.onApplicationBootstrap();

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        `SELECT pg_advisory_lock($1)`,
        [MIGRATION_LOCK_ID],
      );
    });

    it("runs migrations after acquiring the lock", async () => {
      const callOrder: string[] = [];
      mockQueryRunner.query.mockImplementation(async (sql: string) => {
        callOrder.push(sql.includes("pg_advisory_lock(") ? "lock" : "unlock");
      });
      mockDataSource.runMigrations.mockImplementation(async () => {
        callOrder.push("migrate");
        return [];
      });

      await service.onApplicationBootstrap();

      expect(callOrder[0]).toBe("lock");
      expect(callOrder[1]).toBe("migrate");
    });

    it("releases the advisory lock after migrations succeed", async () => {
      await service.onApplicationBootstrap();

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        `SELECT pg_advisory_unlock($1)`,
        [MIGRATION_LOCK_ID],
      );
    });

    it("calls queryRunner.release() after successful migrations", async () => {
      await service.onApplicationBootstrap();

      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it("does not call process.exit on success", async () => {
      await service.onApplicationBootstrap();

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it("passes the same lock ID to both lock and unlock calls", async () => {
      await service.onApplicationBootstrap();

      const lockArgs = mockQueryRunner.query.mock.calls.find((c: any[]) =>
        c[0].includes("pg_advisory_lock("),
      );
      const unlockArgs = mockQueryRunner.query.mock.calls.find((c: any[]) =>
        c[0].includes("pg_advisory_unlock("),
      );

      expect(lockArgs[1]).toEqual([MIGRATION_LOCK_ID]);
      expect(unlockArgs[1]).toEqual([MIGRATION_LOCK_ID]);
    });
  });

  // ---------------------------------------------------------------------------
  // runWithAdvisoryLock error paths
  // ---------------------------------------------------------------------------
  describe("runWithAdvisoryLock — error paths", () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue(true);
    });

    it("calls process.exit(1) when runMigrations throws", async () => {
      mockDataSource.runMigrations.mockRejectedValue(
        new Error("Migration failed"),
      );

      await service.onApplicationBootstrap();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("calls process.exit(1) when queryRunner.connect throws", async () => {
      mockQueryRunner.connect.mockRejectedValue(
        new Error("DB connection error"),
      );

      await service.onApplicationBootstrap();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("calls process.exit(1) when advisory lock acquisition throws", async () => {
      mockQueryRunner.query.mockRejectedValue(new Error("Lock error"));

      await service.onApplicationBootstrap();

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("always calls queryRunner.release() even when migrations throw", async () => {
      mockDataSource.runMigrations.mockRejectedValue(
        new Error("Migration failed"),
      );

      await service.onApplicationBootstrap();

      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it("always calls queryRunner.release() even when connect throws", async () => {
      mockQueryRunner.connect.mockRejectedValue(new Error("Connect error"));

      await service.onApplicationBootstrap();

      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Silent unlock error handling (finally inner try/catch)
  // ---------------------------------------------------------------------------
  describe("runWithAdvisoryLock — unlock error handling", () => {
    beforeEach(() => {
      mockConfigService.get.mockReturnValue(true);
    });

    it("swallows unlock error when migrations succeed and does not call process.exit", async () => {
      mockQueryRunner.query.mockImplementation(async (sql: string) => {
        if (sql.includes("pg_advisory_unlock")) {
          throw new Error("Unlock failed on success path");
        }
      });

      await service.onApplicationBootstrap();

      expect(processExitSpy).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it("swallows unlock error when migrations also fail and still calls process.exit(1)", async () => {
      mockDataSource.runMigrations.mockRejectedValue(
        new Error("Migration failed"),
      );
      mockQueryRunner.query.mockImplementation(async (sql: string) => {
        if (sql.includes("pg_advisory_unlock")) {
          throw new Error("Unlock failed");
        }
      });

      await service.onApplicationBootstrap();

      // process.exit(1) must still be called from the outer catch
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });
  });
});
