const { randomBytes } = require("crypto");

const generateForgotPasswordCode = () => {
    const buf = randomBytes(2);
    const str = buf.toString("hex");
    return str;
};

module.exports = { generateForgotPasswordCode };

