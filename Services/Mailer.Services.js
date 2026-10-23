const { join } = require("path");
const { existsSync, readFileSync } = require("fs");
const { compile } = require("handlebars");

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

class MailerService {
  constructor() {
    this.fromName = process.env.EMAIL_FROM_NAME || "Wispa";
  }

  async #getTemplate(templateName, context) {
    const templatePath = join(__dirname, "../Templates", `${templateName}.hbs`);
    const templateExists = existsSync(templatePath);

    if (!templateExists) {
      throw new Error(`Template ${templateName} not found at path ${templatePath}`);
    }

    const templateContent = readFileSync(templatePath, "utf8");
    const template = compile(templateContent);
    return template(context);
  }

  async #sendEmail({ to, subject, text, html }) {
    const apiKey = process.env.BREVO_API_KEY;
    const fromAddress = process.env.EMAIL_FROM;
    if (!apiKey) throw new Error("BREVO_API_KEY is not configured");
    if (!fromAddress) throw new Error("EMAIL_FROM is not configured");

    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: this.fromName, email: fromAddress },
        to: [{ email: to }],
        replyTo: { email: fromAddress },
        subject,
        textContent: text,
        htmlContent: html,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      let errorDetail = responseBody;
      try {
        const parsedBody = JSON.parse(responseBody);
        errorDetail = parsedBody.message || parsedBody.code || responseBody;
      } catch {
        // Keep the response body as the error detail when it is not JSON.
      }
      throw new Error(`Brevo email API returned HTTP ${response.status}: ${errorDetail}`);
    }
  }

  sendForgotPasswordMail = async (email, code, name) => {
    const html = await this.#getTemplate("forgotPassword", { name, code });

    await this.#sendEmail({
      to: email,
      subject: "Forgot Password Authentication Code",
      text: [
        `Reset your Wispa password`,
        ``,
        `Hey ${name},`,
        ``,
        `Your reset code is: ${code}`,
        ``,
        `This code expires in 10 minutes. Enter it on the reset page to choose a new password.`,
        `Didn't request this? You can safely ignore this email.`,
        `Never share this code with anyone - including us.`,
      ].join("\n"),
      html,
    });
    return { success: true, message: "Email sent successfully." };
  };

  /**
   * Sends the anonymous thread claim email to a BCC address.
   * @param {string} bccEmail - recipient of the email
   * @param {string} alias    - the sender's generated alias, e.g. "SilentFox#4821"
   * @param {string} recipientUsername - the Wispah user they messaged
   * @param {string} claimLink - full URL with claimToken, e.g. https://app.wispah.com/claim?token=...
   */
  sendAnonClaimMail = async (bccEmail, alias, recipientUsername, claimLink) => {
    const html = await this.#getTemplate("anonClaim", {
      alias,
      recipientUsername,
      claimLink,
    });

    await this.#sendEmail({
      to: bccEmail,
      subject: `${recipientUsername} replied to your anonymous message on Wispa — claim your thread`,
      text: [
        `${recipientUsername} replied to your anonymous message on Wispa.`,
        ``,
        `They wrote back to your alias: ${alias}`,
        ``,
        `Create a free Wispa account and claim your thread to read the reply:`,
        claimLink,
        ``,
        `This link expires in 7 days.`,
        `We will never reveal your email to ${recipientUsername}.`,
        `Didn't send this message? Just ignore this email.`,
      ].join("\n"),
      html,
    });
    return { success: true, message: "Claim email sent." };
  };

  sendAnonReplyMail = async (email, alias, recipientUsername, content, appLink) => {
    const html = await this.#getTemplate("anonReply", {
      alias,
      recipientUsername,
      content,
      appLink,
    });

    await this.#sendEmail({
      to: email,
      subject: `${recipientUsername} replied to your anonymous message on Wispa`,
      text: [
        `${recipientUsername} replied to your anonymous message on Wispa.`,
        ``,
        `Your alias: ${alias}`,
        ``,
        `${recipientUsername} wrote:`,
        content,
        ``,
        `Visit Wispa: ${appLink}`,
      ].join("\n"),
      html,
    });
    return { success: true, message: "Reply notification sent." };
  };
}

module.exports = MailerService;
