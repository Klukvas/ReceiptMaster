import { TenantContextSubscriber, tenantStore } from './tenant-context.subscriber';

describe('TenantContextSubscriber', () => {
  let subscriber: TenantContextSubscriber;
  let mockQueryRunner: { query: jest.Mock };

  beforeEach(() => {
    subscriber = new TenantContextSubscriber();
    mockQueryRunner = { query: jest.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const makeEvent = (queryRunner: { query: jest.Mock }) =>
    ({ queryRunner }) as any;

  describe('beforeInsert', () => {
    it('calls queryRunner.query with SET LOCAL when tenant context exists', async () => {
      await tenantStore.run({ userId: 'test-user-id' }, async () => {
        await subscriber.beforeInsert(makeEvent(mockQueryRunner));
        expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
        expect(mockQueryRunner.query).toHaveBeenCalledWith(
          "SET LOCAL app.current_user_id = 'test-user-id'",
        );
      });
    });

    it('does NOT call queryRunner.query when no tenant context', async () => {
      await subscriber.beforeInsert(makeEvent(mockQueryRunner));
      expect(mockQueryRunner.query).not.toHaveBeenCalled();
    });
  });

  describe('beforeUpdate', () => {
    it('calls queryRunner.query with SET LOCAL when tenant context exists', async () => {
      await tenantStore.run({ userId: 'test-user-id' }, async () => {
        await subscriber.beforeUpdate(makeEvent(mockQueryRunner));
        expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
        expect(mockQueryRunner.query).toHaveBeenCalledWith(
          "SET LOCAL app.current_user_id = 'test-user-id'",
        );
      });
    });

    it('does NOT call queryRunner.query when no tenant context', async () => {
      await subscriber.beforeUpdate(makeEvent(mockQueryRunner));
      expect(mockQueryRunner.query).not.toHaveBeenCalled();
    });
  });

  describe('beforeRemove', () => {
    it('calls queryRunner.query with SET LOCAL when tenant context exists', async () => {
      await tenantStore.run({ userId: 'test-user-id' }, async () => {
        await subscriber.beforeRemove(makeEvent(mockQueryRunner));
        expect(mockQueryRunner.query).toHaveBeenCalledTimes(1);
        expect(mockQueryRunner.query).toHaveBeenCalledWith(
          "SET LOCAL app.current_user_id = 'test-user-id'",
        );
      });
    });

    it('does NOT call queryRunner.query when no tenant context', async () => {
      await subscriber.beforeRemove(makeEvent(mockQueryRunner));
      expect(mockQueryRunner.query).not.toHaveBeenCalled();
    });
  });

  describe('tenantStore isolation', () => {
    it('does not bleed context across independent runs', async () => {
      const firstQuery = jest.fn().mockResolvedValue(undefined);
      const secondQuery = jest.fn().mockResolvedValue(undefined);

      await tenantStore.run({ userId: 'user-a' }, async () => {
        await subscriber.beforeInsert(makeEvent({ query: firstQuery }));
      });

      await subscriber.beforeInsert(makeEvent({ query: secondQuery }));

      expect(firstQuery).toHaveBeenCalledWith(
        "SET LOCAL app.current_user_id = 'user-a'",
      );
      expect(secondQuery).not.toHaveBeenCalled();
    });

    it('uses the correct userId from the current store context', async () => {
      await tenantStore.run({ userId: 'specific-user-456' }, async () => {
        await subscriber.beforeUpdate(makeEvent(mockQueryRunner));
        expect(mockQueryRunner.query).toHaveBeenCalledWith(
          "SET LOCAL app.current_user_id = 'specific-user-456'",
        );
      });
    });
  });
});
