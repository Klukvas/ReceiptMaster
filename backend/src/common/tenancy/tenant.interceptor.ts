import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { runWithTenant } from "./tenant-context";

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: { id: string } }>();
    if (!request.user?.id) return next.handle();
    const userId = request.user.id;
    return new Observable((subscriber) =>
      runWithTenant(userId, () => next.handle().subscribe(subscriber)),
    );
  }
}
