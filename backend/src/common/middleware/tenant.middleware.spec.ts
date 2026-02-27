import { TenantMiddleware } from './tenant.middleware';
import { tenantStore } from '../subscribers/tenant-context.subscriber';

jest.mock('../subscribers/tenant-context.subscriber', () => ({
  tenantStore: {
    run: jest.fn((ctx, callback) => callback()),
  },
}));

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;

  beforeEach(() => {
    middleware = new TenantMiddleware();
    jest.clearAllMocks();
  });

  it('should run next inside tenantStore context when user is present', () => {
    const req = { user: { id: 'user-123' } } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(tenantStore.run).toHaveBeenCalledWith(
      { userId: 'user-123' },
      expect.any(Function),
    );
    expect(next).toHaveBeenCalled();
  });

  it('should call next directly when no user is present', () => {
    const req = { user: undefined } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(tenantStore.run).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should call next directly when user has no id', () => {
    const req = { user: {} } as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(tenantStore.run).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('should call next directly when req has no user property', () => {
    const req = {} as any;
    const res = {} as any;
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(tenantStore.run).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });
});
