const {createTransport} = require('nodemailer');
const {join} = require("path");
const {existsSync, readFileSync} = require("fs");
const {compile} = require("handlebars")

class MailerService{
    constructor (){
        this.transporter = createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL,
                pass: process.env.PASSWORD
            }
        })
        // A display name and a From address that exactly matches the
        // authenticated Gmail account is required for SPF/DKIM alignment.
        this.fromAddress = process.env.EMAIL_FROM || process.env.EMAIL;
        this.fromName = process.env.EMAIL_FROM_NAME || "Wispa";
    }

    #from () {
        return { name: this.fromName, address: this.fromAddress };
    }

    async #getTemplate(templateName , context){
        const templatePath = join(__dirname,"../Templates", `${templateName}.hbs`);
        const templateExists = existsSync(templatePath);

        if (!templateExists) {
            throw new Error(`Template ${templateName} not found at path ${templatePath}`);
        }

        const templateContent = readFileSync(templatePath, "utf8");
        const template = compile(templateContent);
        return template(context);
    }

    sendForgotPasswordMail = async (email, code, name) => {
        try {
            const html = await this.#getTemplate("forgotPassword", { name, code });

            await this.transporter.sendMail({
                from: this.#from(),
                to: email,
                replyTo: this.fromAddress,
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
        } catch (error) {
            throw error;
        }
    }

    /**
     * Sends the anonymous thread claim email to a BCC address.
     * @param {string} bccEmail - recipient of the email
     * @param {string} alias    - the sender's generated alias, e.g. "SilentFox#4821"
     * @param {string} recipientUsername - the Wispah user they messaged
     * @param {string} claimLink - full URL with claimToken, e.g. https://app.wispah.com/claim?token=...
     */
    sendAnonClaimMail = async (bccEmail, alias, recipientUsername, claimLink) => {
        try {
            const html = await this.#getTemplate("anonClaim", {
                alias,
                recipientUsername,
                claimLink,
            });

            await this.transporter.sendMail({
                from: this.#from(),
                to: bccEmail,
                replyTo: this.fromAddress,
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
        } catch (error) {
            throw error;
        }
    }

    sendAnonReplyMail = async (email, alias, recipientUsername, content, appLink) => {
        const html = await this.#getTemplate("anonReply", {
            alias,
            recipientUsername,
            content,
            appLink,
        });

        await this.transporter.sendMail({
            from: this.#from(),
            to: email,
            replyTo: this.fromAddress,
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
    }
}

module.exports = MailerService
