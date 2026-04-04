import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "Agentic <noreply@mail.w-gateway.cc>";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

export class EmailService {
    static async sendVerificationEmail(email: string, token: string) {
        await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: "Verifica tu email — Agentic",
            html: `
                <h2>Bienvenido a Agentic</h2>
                <p>Haz clic en el siguiente enlace para verificar tu email:</p>
                <a href="${APP_URL}/auth/verify-email?token=${token}"
                   style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
                    Verificar email
                </a>
                <p style="color:#666;font-size:14px;margin-top:16px;">Este enlace expira en 24 horas.</p>
            `
        });
    }

    static async sendPasswordResetEmail(email: string, token: string) {
        await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: "Restablecer contraseña — Agentic",
            html: `
                <h2>Restablecer contraseña</h2>
                <p>Haz clic en el siguiente enlace para restablecer tu contraseña:</p>
                <a href="${APP_URL}/auth/reset-password?token=${token}"
                   style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
                    Restablecer contraseña
                </a>
                <p style="color:#666;font-size:14px;margin-top:16px;">Este enlace expira en 1 hora. Si no solicitaste esto, ignora este email.</p>
            `
        });
    }

    static async sendInvitationEmail(email: string, orgName: string, token: string) {
        await resend.emails.send({
            from: FROM_EMAIL,
            to: email,
            subject: `Invitación a ${orgName} — Agentic`,
            html: `
                <h2>Te han invitado a ${orgName}</h2>
                <p>Has sido invitado a unirte a <strong>${orgName}</strong> en Agentic.</p>
                <a href="${APP_URL}/auth/accept-invite?token=${token}"
                   style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
                    Aceptar invitación
                </a>
                <p style="color:#666;font-size:14px;margin-top:16px;">Este enlace expira en 7 días.</p>
            `
        });
    }
}
