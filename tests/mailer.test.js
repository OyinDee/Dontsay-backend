jest.unmock("../Services/Mailer.Services");

const MailerService = require("../Services/Mailer.Services");

describe("MailerService Brevo delivery", () => {
  const originalApiKey = process.env.BREVO_API_KEY;
  const originalFrom = process.env.EMAIL_FROM;
  const originalFromName = process.env.EMAIL_FROM_NAME;
  const originalFetch = global.fetch;
  let mailer;

  beforeEach(() => {
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.EMAIL_FROM = "verified@example.com";
    process.env.EMAIL_FROM_NAME = "Wispa Test";
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    mailer = new MailerService();
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = originalApiKey;
    if (originalFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalFrom;
    if (originalFromName === undefined) delete process.env.EMAIL_FROM_NAME;
    else process.env.EMAIL_FROM_NAME = originalFromName;
    global.fetch = originalFetch;
  });

  it("sends anonymous replies through Brevo's HTTPS API", async () => {
    await expect(
      mailer.sendAnonReplyMail(
        "sender@example.com",
        "SilentFox#4821",
        "recipient",
        "Hello there",
        "https://wispah.vercel.app"
      )
    ).resolves.toEqual({
      success: true,
      message: "Reply notification sent.",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "api-key": "test-api-key",
          "content-type": "application/json",
        }),
      })
    );
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual(
      expect.objectContaining({
        sender: { name: "Wispa Test", email: "verified@example.com" },
        to: [{ email: "sender@example.com" }],
        replyTo: { email: "verified@example.com" },
        subject: "recipient replied to your anonymous message on Wispa",
        textContent: expect.stringContaining("Hello there"),
        htmlContent: expect.stringContaining("Hello there"),
      })
    );
  });

  it("uses the same transport for claim and password-reset emails", async () => {
    await mailer.sendAnonClaimMail(
      "sender@example.com",
      "SilentFox#4821",
      "recipient",
      "https://wispah.vercel.app/claim"
    );
    await mailer.sendForgotPasswordMail("user@example.com", "123456", "user");

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).to[0].email).toBe(
      "sender@example.com"
    );
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).to[0].email).toBe(
      "user@example.com"
    );
  });

  it("surfaces Brevo API errors", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: "Invalid api-key" }),
    });

    await expect(
      mailer.sendAnonReplyMail(
        "sender@example.com",
        "SilentFox#4821",
        "recipient",
        "Hello",
        "https://wispah.vercel.app"
      )
    ).rejects.toThrow("Brevo email API returned HTTP 401: Invalid api-key");
  });

  it("fails clearly when the Brevo API key is missing", async () => {
    delete process.env.BREVO_API_KEY;

    await expect(
      mailer.sendAnonReplyMail(
        "sender@example.com",
        "SilentFox#4821",
        "recipient",
        "Hello",
        "https://wispah.vercel.app"
      )
    ).rejects.toThrow("BREVO_API_KEY is not configured");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
