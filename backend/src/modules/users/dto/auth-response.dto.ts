export class AuthResponseDto {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
  };
}

/** A password change keeps the calling session: it answers with that session's new pair. */
export class ChangePasswordResponseDto extends AuthResponseDto {
  message: string;
}
