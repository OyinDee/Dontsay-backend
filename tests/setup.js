/**
 * Jest global setup — mocks all external I/O so no real DB, email,
 * or Cloudinary calls happen. Tests run purely in-process.
 */

// ── Silence mongoose connect so tests don't need a real URI ───
jest.mock("mongoose", () => {
  const actual = jest.requireActual("mongoose");
  return {
    ...actual,
    connect: jest.fn().mockResolvedValue(true),
  };
});

// ── Mock MailerService ────────────────────────────────────────
jest.mock("../Services/Mailer.Services", () =>
  jest.fn().mockImplementation(() => ({
    sendForgotPasswordMail: jest
      .fn()
      .mockResolvedValue({ success: true, message: "Email sent successfully." }),
    sendAnonClaimMail: jest
      .fn()
      .mockResolvedValue({ success: true, message: "Claim email sent." }),
    sendAnonReplyMail: jest
      .fn()
      .mockResolvedValue({ success: true, message: "Reply notification sent." }),
  }))
);

// ── Mock Cloudinary util ──────────────────────────────────────
jest.mock("../Utils/Cloudinary.utils", () => ({
  uploadToCloudinary: jest
    .fn()
    .mockResolvedValue("https://res.cloudinary.com/mock/image/upload/test.jpg"),
  uploadAudioToCloudinary: jest
    .fn()
    .mockResolvedValue("https://res.cloudinary.com/mock/video/upload/test.webm"),
  cloudinary: {},
}));
