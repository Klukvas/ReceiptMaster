import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { Raw, Repository } from "typeorm";
import { normalizeEmail } from "../../common/dto/normalized-email";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { User } from "./entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";

import { REFRESH_TOKEN_PATTERN } from "./dto/refresh-token.dto";

const REFRESH_TOKEN_EXPIRATION_DAYS = 30;

// Accounts created before emails were normalised may still be stored with capitals.
const emailEquals = (email: string) =>
  Raw((alias) => `LOWER(${alias}) = :email`, {
    email: normalizeEmail(email),
  });

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private async createRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(64).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRATION_DAYS);

    const refreshToken = this.refreshTokenRepository.create({
      token,
      user_id: userId,
      expires_at: expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);
    return token;
  }

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password } = registerDto;

    const existingUser = await this.userRepository.findOne({
      where: { email: emailEquals(email) },
    });

    if (existingUser) {
      throw ApiErrors.USER_ALREADY_EXISTS(registerDto.email);
    }

    const saltRounds = 10;
    const _hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = this.userRepository.create({
      email,
      password: _hashedPassword,
    });

    const savedUser = await this.userRepository.save(user);

    const payload = { sub: savedUser.id, email: savedUser.email };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = await this.createRefreshToken(savedUser.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: savedUser.id,
        email: savedUser.email,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    const user = await this.userRepository.findOne({
      where: { email: emailEquals(email) },
    });

    if (!user || !user.isActive) {
      throw ApiErrors.INVALID_CREDENTIALS();
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw ApiErrors.INVALID_CREDENTIALS();
    }

    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = await this.createRefreshToken(user.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async refreshToken(token: string): Promise<AuthResponseDto> {
    this.assertRefreshToken(token);
    const existing = await this.refreshTokenRepository.findOne({
      where: { token, revoked: false },
      relations: ["user"],
    });

    if (!existing || existing.expires_at < new Date()) {
      throw ApiErrors.UNAUTHORIZED();
    }

    // Revoke old token (rotation)
    existing.revoked = true;
    await this.refreshTokenRepository.save(existing);

    // Issue new tokens
    const user = existing.user;
    const payload = { sub: user.id, email: user.email };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = await this.createRefreshToken(user.id);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    this.assertRefreshToken(token);
    await this.refreshTokenRepository.update({ token }, { revoked: true });
  }

  private assertRefreshToken(token: unknown): asserts token is string {
    if (typeof token !== "string" || !REFRESH_TOKEN_PATTERN.test(token)) {
      throw ApiErrors.UNAUTHORIZED();
    }
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { user_id: userId, revoked: false },
      { revoked: true },
    );
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: emailEquals(email) },
    });
  }

  async updateProfile(
    userId: string,
    updateProfileDto: UpdateProfileDto,
  ): Promise<Omit<User, "password">> {
    const { email } = updateProfileDto;

    const existingUser = await this.userRepository.findOne({
      where: { email: emailEquals(email) },
    });

    if (existingUser && existingUser.id !== userId) {
      throw ApiErrors.USER_ALREADY_EXISTS(email);
    }

    await this.userRepository.update(userId, { email });

    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!updatedUser) {
      throw ApiErrors.USER_NOT_FOUND(userId);
    }

    const { password: _password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const { currentPassword, newPassword, confirmPassword } = changePasswordDto;

    if (newPassword !== confirmPassword) {
      throw ApiErrors.VALIDATION_ERROR(
        "password",
        "New password and confirmation do not match",
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw ApiErrors.USER_NOT_FOUND(userId);
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw ApiErrors.VALIDATION_ERROR(
        "currentPassword",
        "Current password is incorrect",
      );
    }

    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      throw ApiErrors.VALIDATION_ERROR(
        "newPassword",
        "New password must be different from the current one",
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.userRepository.update(userId, { password: hashedPassword });

    // Revoke all refresh tokens on password change
    await this.revokeAllUserTokens(userId);
  }
}
