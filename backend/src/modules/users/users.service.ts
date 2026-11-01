import { Injectable, Logger } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/ApiError";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Raw, Repository } from "typeorm";
import { normalizeEmail } from "../../common/dto/normalized-email";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { User } from "./entities/user.entity";
import { RefreshToken } from "./entities/refresh-token.entity";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";

import { REFRESH_TOKEN_PATTERN } from "./dto/refresh-token.dto";
import {
  familyOf,
  findPresentedToken,
  isReplay,
  issueRefreshToken,
  redeemRefreshToken,
  revokePresentedToken,
  revokeRefreshTokenFamily,
} from "./refresh-tokens";

/** Decided inside the rotation transaction; the 401 is thrown only after it commits. */
type RefreshOutcome =
  | { readonly kind: "rotated"; readonly response: AuthResponseDto }
  | { readonly kind: "rejected" }
  | {
      readonly kind: "replayed";
      readonly userId: string;
      readonly familyId: string;
      readonly revokedCount: number;
    };

const REJECTED: RefreshOutcome = { kind: "rejected" };

// Accounts created before emails were normalised may still be stored with capitals.
const emailEquals = (email: string) =>
  Raw((alias) => `LOWER(${alias}) = :email`, {
    email: normalizeEmail(email),
  });

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private createRefreshToken(userId: string): Promise<string> {
    return issueRefreshToken(this.refreshTokenRepository.manager, userId);
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

  /**
   * Single-use rotation: redeeming the old token and inserting its successor
   * commit together. Of concurrent refreshes with one token only the first
   * conditional UPDATE matches; the rest re-check after it commits and get 401.
   * A failed successor insert rolls the redemption back, so the token still works.
   * A spent token presented after the replay grace window revokes its whole
   * family; that revocation commits before the 401 is thrown.
   */
  async refreshToken(token: string): Promise<AuthResponseDto> {
    this.assertRefreshToken(token);
    const outcome = await this.refreshTokenRepository.manager.transaction(
      (manager) => this.rotateRefreshToken(manager, token),
    );
    if (outcome.kind === "rotated") {
      return outcome.response;
    }
    if (outcome.kind === "replayed") {
      this.logger.warn(
        `Refresh token replay: revoked ${outcome.revokedCount} live token(s) of family ${outcome.familyId} (user ${outcome.userId})`,
      );
    }
    throw ApiErrors.UNAUTHORIZED();
  }

  private async rotateRefreshToken(
    manager: EntityManager,
    token: string,
  ): Promise<RefreshOutcome> {
    const presented = await findPresentedToken(manager, token);
    if (!presented) {
      return REJECTED;
    }
    // Lock order users → refresh_tokens, as in changePassword. FOR NO KEY UPDATE
    // serializes every rotation and password change of one user, so a family
    // or password revocation always runs after (and sees) any successor a
    // concurrent rotation inserted, or before it (and that redemption fails).
    // Unlike FOR UPDATE it leaves the FK checks of inserts referencing the user free.
    const user = await manager.findOne(User, {
      where: { id: presented.user_id },
      lock: { mode: "for_no_key_update" },
    });
    if (!user?.isActive) {
      return REJECTED;
    }

    const now = new Date();
    if (await redeemRefreshToken(manager, presented.id, now)) {
      return {
        kind: "rotated",
        response: await this.issueSuccessor(manager, user, familyOf(presented)),
      };
    }

    // Expired, revoked, or redeemed — possibly by a rotation that committed while
    // this one waited. This later statement sees that commit and its redeemed_at.
    const current = await findPresentedToken(manager, token);
    if (!current || !isReplay(current, now)) {
      return REJECTED;
    }
    const familyId = familyOf(current);
    const revokedCount = await revokeRefreshTokenFamily(manager, familyId);
    return { kind: "replayed", userId: user.id, familyId, revokedCount };
  }

  private async issueSuccessor(
    manager: EntityManager,
    user: User,
    familyId: string,
  ): Promise<AuthResponseDto> {
    const payload = { sub: user.id, email: user.email };
    return {
      access_token: this.jwtService.sign(payload),
      refresh_token: await issueRefreshToken(manager, user.id, familyId),
      user: {
        id: user.id,
        email: user.email,
      },
    };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    this.assertRefreshToken(token);
    await revokePresentedToken(this.refreshTokenRepository.manager, token);
  }

  private assertRefreshToken(token: unknown): asserts token is string {
    if (typeof token !== "string" || !REFRESH_TOKEN_PATTERN.test(token)) {
      throw ApiErrors.UNAUTHORIZED();
    }
  }

  /** Pass a transaction's manager to revoke within it. */
  async revokeAllUserTokens(
    userId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(RefreshToken) ?? this.refreshTokenRepository;
    await repository.update(
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

    // One transaction, users row first (the lock order rotation uses): an
    // in-flight rotation holds that row FOR NO KEY UPDATE, so this UPDATE waits
    // for its successor to commit and the revocation, a later statement, sees it.
    await this.userRepository.manager.transaction(async (manager) => {
      await manager.update(User, userId, { password: hashedPassword });
      await this.revokeAllUserTokens(userId, manager);
    });
  }
}
