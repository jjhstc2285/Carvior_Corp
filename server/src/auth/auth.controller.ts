import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LinkEmployeeDto, LoginDto, SocialLoginDto } from './dto/login.dto';
import { Public } from './public.decorator';
import { CurrentUser, type AuthUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Post('social')
  @HttpCode(200)
  social(@Body() dto: SocialLoginDto) {
    return this.auth.socialLogin(dto);
  }

  @Public()
  @Post('link')
  @HttpCode(200)
  link(@Body() body: LinkEmployeeDto & { pendingToken: string }) {
    return this.auth.linkEmployee(body.pendingToken, body.employeeId);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('password')
  @HttpCode(204)
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.id, dto);
  }
}
