import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: jest.Mocked<UsersService>;

  const mockAuthResponse = {
    access_token: 'jwt-token',
    refresh_token: 'refresh-token',
    user: { id: 'user-1', email: 'test@test.com' },
  };

  beforeEach(() => {
    usersService = {
      register: jest.fn().mockResolvedValue(mockAuthResponse),
      login: jest.fn().mockResolvedValue(mockAuthResponse),
      refreshToken: jest.fn().mockResolvedValue(mockAuthResponse),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      updateProfile: jest.fn(),
      changePassword: jest.fn().mockResolvedValue(undefined),
    } as any;

    controller = new UsersController(usersService);
  });

  describe('register', () => {
    it('should call usersService.register and return auth response', async () => {
      const dto = { email: 'new@test.com', password: 'Password123!' };

      const result = await controller.register(dto);

      expect(usersService.register).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('login', () => {
    it('should call usersService.login and return auth response', async () => {
      const dto = { email: 'test@test.com', password: 'pw' };

      const result = await controller.login(dto);

      expect(usersService.login).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('refresh', () => {
    it('should call usersService.refreshToken', async () => {
      const result = await controller.refresh({ refresh_token: 'old-token' });

      expect(usersService.refreshToken).toHaveBeenCalledWith('old-token');
      expect(result).toEqual(mockAuthResponse);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token and return success message', async () => {
      const result = await controller.logout({ refresh_token: 'token' });

      expect(usersService.revokeRefreshToken).toHaveBeenCalledWith('token');
      expect(result).toEqual({ message: 'Logged out successfully' });
    });
  });

  describe('getProfile', () => {
    it('should return user without password', async () => {
      const req = {
        user: {
          id: 'user-1',
          email: 'test@test.com',
          password: 'hashed',
          isActive: true,
        },
      };

      const result = await controller.getProfile(req);

      expect(result).not.toHaveProperty('password');
      expect(result).toHaveProperty('email', 'test@test.com');
    });
  });

  describe('updateProfile', () => {
    it('should call usersService.updateProfile', async () => {
      const updatedUser = { id: 'user-1', email: 'new@test.com', isActive: true };
      usersService.updateProfile.mockResolvedValue(updatedUser as any);

      const req = { user: { id: 'user-1' } };

      const result = await controller.updateProfile(req, {
        email: 'new@test.com',
      });

      expect(usersService.updateProfile).toHaveBeenCalledWith('user-1', {
        email: 'new@test.com',
      });
    });
  });

  describe('changePassword', () => {
    it('should call usersService.changePassword and return message', async () => {
      const req = { user: { id: 'user-1' } };
      const dto = {
        currentPassword: 'old',
        newPassword: 'new',
        confirmPassword: 'new',
      };

      const result = await controller.changePassword(req, dto);

      expect(usersService.changePassword).toHaveBeenCalledWith('user-1', dto);
      expect(result).toEqual({ message: 'Password changed successfully' });
    });
  });
});
