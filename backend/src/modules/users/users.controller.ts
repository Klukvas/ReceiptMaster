import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Patch,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { User } from "./entities/user.entity";

@ApiTags("auth")
@Controller("auth")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("register")
  @ApiOperation({ summary: "Регистрация нового пользователя" })
  @ApiResponse({
    status: 201,
    description: "Пользователь успешно зарегистрирован",
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "Пользователь с таким email уже существует",
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.usersService.register(registerDto);
  }

  @Post("login")
  @ApiOperation({ summary: "Вход в систему" })
  @ApiResponse({
    status: 200,
    description: "Успешный вход в систему",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Неверные учетные данные" })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.usersService.login(loginDto);
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Получить профиль текущего пользователя" })
  @ApiResponse({ status: 200, description: "Профиль пользователя", type: User })
  @ApiResponse({ status: 401, description: "Неавторизован" })
  async getProfile(@Request() req): Promise<Omit<User, "password">> {
    const { password: _password, ...userWithoutPassword } = req.user;
    return userWithoutPassword;
  }

  @Patch("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Обновить профиль текущего пользователя" })
  @ApiResponse({ status: 200, description: "Профиль обновлен", type: User })
  @ApiResponse({ status: 401, description: "Неавторизован" })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto
  ): Promise<Omit<User, "password">> {
    return this.usersService.updateProfile(req.user.id, updateProfileDto);
  }
}
