import { Injectable } from "@nestjs/common";
import { ApiErrors } from "../../../common/errors/ApiError";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { findAccessTokenOwner } from "../access-token";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET"),
    });
  }

  /**
   * Runs after passport-jwt verified the signature and expiry. A token whose `tv` claim
   * differs from the account's token version (logout, password change since) gets the
   * same 401 as an invalid one, so the client refreshes as it would on expiry.
   */
  async validate(payload: { sub?: unknown; tv?: unknown }): Promise<User> {
    const user = await findAccessTokenOwner(this.userRepository, payload);
    if (!user) {
      throw ApiErrors.UNAUTHORIZED();
    }
    return user;
  }
}
