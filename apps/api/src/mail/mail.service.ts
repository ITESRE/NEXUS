import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host:
        this.configService.getOrThrow<string>(
          'SMTP_HOST',
        ),
      port:
        this.configService.getOrThrow<number>(
          'SMTP_PORT',
        ),
      secure:
        this.configService.getOrThrow<boolean>(
          'SMTP_SECURE',
        ),
    });

    this.from =
      this.configService.getOrThrow<string>(
        'SMTP_FROM',
      );

    this.frontendUrl =
      this.configService.getOrThrow<string>(
        'FRONTEND_URL',
      );
  }

  async sendPasswordResetEmail(
    recipientEmail: string,
    resetToken: string,
  ): Promise<void> {
    const resetUrl = new URL(
      '/reset-password',
      this.frontendUrl,
    );

    resetUrl.searchParams.set(
      'token',
      resetToken,
    );

    await this.transporter.sendMail({
      from: this.from,
      to: recipientEmail,
      subject:
        'Réinitialisation de votre mot de passe NEXUS',
      text: [
        'Une demande de réinitialisation de mot de passe a été effectuée pour votre compte NEXUS.',
        '',
        `Utilisez ce lien : ${resetUrl.toString()}`,
        '',
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
      ].join('\n'),
      html: `
        <p>Une demande de réinitialisation de mot de passe a été effectuée pour votre compte NEXUS.</p>
        <p>
          <a href="${resetUrl.toString()}">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      `,
    });
  }

  async sendEmailChangeVerificationEmail(
    recipientEmail: string,
    emailChangeToken: string,
  ): Promise<void> {
    const verificationUrl = new URL(
      '/verify-email-change',
      this.frontendUrl,
    );

    verificationUrl.searchParams.set(
      'token',
      emailChangeToken,
    );

    const verificationUrlString =
      verificationUrl.toString();

    await this.transporter.sendMail({
      from: this.from,
      to: recipientEmail,
      subject:
        'Vérification de votre nouvelle adresse email NEXUS',
      text: [
        'Une demande de changement d’adresse email a été effectuée pour votre compte NEXUS.',
        '',
        `Confirmez votre nouvelle adresse avec ce lien : ${verificationUrlString}`,
        '',
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
      ].join('\n'),
      html: `
        <p>Une demande de changement d’adresse email a été effectuée pour votre compte NEXUS.</p>
        <p>
          <a href="${verificationUrlString}">
            Confirmer ma nouvelle adresse email
          </a>
        </p>
        <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      `,
    });
  }

}