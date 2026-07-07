import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { MailService } from '../../common/mail/mail.service';
// SystemPrismaService use is BY DESIGN: verification operates on the
// global User identity (docs/02 §5).
import { SystemPrismaService } from '../../common/prisma/system-prisma.service';
import { TokenService } from './token.service';

/** MP-3 (docs/07) — email verification behind the directory's trust badge. */
@Injectable()
export class VerificationService {
  constructor(
    private readonly system: SystemPrismaService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
  ) {}

  async request(userId: string): Promise<{ sent: boolean; alreadyVerified?: boolean }> {
    const user = await this.system.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return { sent: false, alreadyVerified: true };

    const token = randomBytes(32).toString('hex');
    await this.system.user.update({
      where: { id: userId },
      data: { verifyTokenHash: this.tokens.sha256(token) },
    });
    const link = `${process.env.WEB_APP_URL ?? 'http://localhost:3000'}/verify-email?token=${token}`;
    await this.mail.sendVerification(user.email, link);
    return { sent: true };
  }

  async confirm(token: string): Promise<{ verified: true; email: string }> {
    const user = await this.system.user.findUnique({
      where: { verifyTokenHash: this.tokens.sha256(token) },
    });
    if (!user) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'This verification link is invalid or already used',
      });
    }
    await this.system.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), verifyTokenHash: null },
    });
    return { verified: true, email: user.email };
  }
}
