import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EnvConfig } from "../../config/env.schema";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private configService: ConfigService<EnvConfig>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers["x-api-key"];
    const expectedApiKey = this.configService.get("API_KEY");

    // Если API_KEY не настроен, пропускаем проверку
    if (!expectedApiKey) {
      return true;
    }

    if (!apiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException("Неверный API ключ");
    }

    return true;
  }
}
