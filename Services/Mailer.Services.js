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
}

module.exports = MailerService


