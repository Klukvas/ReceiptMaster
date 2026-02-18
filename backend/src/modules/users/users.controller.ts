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
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { UsersService } from "./users.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { AuthResponseDto } from "./dto/auth-response.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { User } from "./entities/user.entity";

@ApiTags("auth")
@Controller("auth")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("register")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: "Register a new user" })
  @ApiResponse({
    status: 201,
    description: "User registered successfully",
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: "User with this email already exists",
  })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.usersService.register(registerDto);
  }

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: "Login" })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  @ApiResponse({ status: 429, description: "Too many login attempts" })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.usersService.login(loginDto);
  }

  @Post("refresh")
  @ApiOperation({ summary: "Refresh access token using refresh token" })
  @ApiResponse({
    status: 200,
    description: "Tokens refreshed successfully",
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: "Invalid or expired refresh token" })
  async refresh(
    @Body() body: { refresh_token: string },
  ): Promise<AuthResponseDto> {
    return this.usersService.refreshToken(body.refresh_token);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Logout and revoke refresh token" })
  @ApiResponse({ status: 200, description: "Logged out successfully" })
  async logout(
    @Body() body: { refresh_token: string },
  ): Promise<{ message: string }> {
    await this.usersService.revokeRefreshToken(body.refresh_token);
    return { message: "Logged out successfully" };
  }

  @Get("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Get current user profile" })
  @ApiResponse({ status: 200, description: "User profile", type: User })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async getProfile(@Request() req): Promise<Omit<User, "password">> {
    const { password: _password, ...userWithoutPassword } = req.user;
    return userWithoutPassword;
  }

  @Patch("profile")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Update current user profile" })
  @ApiResponse({ status: 200, description: "Profile updated", type: User })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async updateProfile(
    @Request() req,
    @Body() updateProfileDto: UpdateProfileDto
  ): Promise<Omit<User, "password">> {
    return this.usersService.updateProfile(req.user.id, updateProfileDto);
  }

  @Post("change-password")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth("bearer")
  @ApiOperation({ summary: "Change current user password" })
  @ApiResponse({ status: 200, description: "Password changed successfully" })
  @ApiResponse({ status: 400, description: "Validation error" })
  @ApiResponse({ status: 401, description: "Unauthorized" })
  async changePassword(
    @Request() req,
    @Body() changePasswordDto: ChangePasswordDto
  ): Promise<{ message: string }> {
    await this.usersService.changePassword(req.user.id, changePasswordDto);
    return { message: "Password changed successfully" };
  }
}
