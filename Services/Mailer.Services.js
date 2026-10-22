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
    }

    #EMAIL = process.env.EMAIL;

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
                from: this.#EMAIL,
                to: email,
                subject: "Forgot Password Authentication Code",
                html
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
                from: this.#EMAIL,
                to: bccEmail,
                subject: `${recipientUsername} replied to your anonymous message on Wispa — claim your thread`,
                html,
            });
            return { success: true, message: "Claim email sent." };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = MailerService

