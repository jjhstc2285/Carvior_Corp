import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Role, SignupStatus } from '@prisma/client';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LinkEmployeeDto, LoginDto, SocialLoginDto } from './dto/login.dto';
import { OwnerSignupDto, ReviewSignupDto, SignupDto } from './dto/signup.dto';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
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

  /** 회원가입 신청 — 로그인 전이라 열어둔다. 승인 전에는 로그인되지 않는다. */
  @Public()
  @Post('signup')
  @HttpCode(200)
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  /** 대기 중인 가입 신청 — 관리자만 */
  @Roles(Role.ADMIN)
  @Get('signups')
  signups(@Query('status') status?: SignupStatus) {
    return this.auth.listSignups(status);
  }

  @Roles(Role.ADMIN)
  @Post('signups/:id/review')
  @HttpCode(200)
  reviewSignup(@Param('id') id: string, @Body() dto: ReviewSignupDto) {
    return this.auth.reviewSignup(id, dto);
  }

  /**
   * 상사 개설 신청 — 로그인 전이라 열어둔다.
   *
   * 계정도 상사도 만들지 않는다. 신청만 쌓고 사람이 확인해 손으로 연다.
   */
  @Public()
  @Post('owner-signup')
  @HttpCode(200)
  ownerSignup(@Body() dto: OwnerSignupDto) {
    return this.auth.ownerSignup(dto);
  }

  /** 들어온 상사 개설 신청 — 관리자만 */
  @Roles(Role.ADMIN)
  @Get('owner-signups')
  ownerSignups(@Query('status') status?: SignupStatus) {
    return this.auth.listOwnerSignups(status);
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
