const { anonMessageModel } = require("../Models/AnonMessage.model");

const messageFields = {
  threadId: "507f1f77bcf86cd799439011",
  fromAlias: "SilentFox#4821",
  senderRole: "sender",
};

describe("anonymous message validation", () => {
  it("accepts an image-only message", async () => {
    const message = new anonMessageModel({
      ...messageFields,
      content: "",
      imageURL: "https://image.test/photo.jpg",
    });

    await expect(message.validate()).resolves.toBeUndefined();
  });

  it("accepts a voice-note-only message", async () => {
    const message = new anonMessageModel({
      ...messageFields,
      content: "",
      voiceURL: "https://audio.test/note.webm",
    });

    await expect(message.validate()).resolves.toBeUndefined();
  });

  it("rejects an empty message without an attachment", async () => {
    const message = new anonMessageModel({ ...messageFields, content: "  " });

    await expect(message.validate()).rejects.toThrow(
      "An anonymous message must include text, an image, or a voice note"
    );
  });
});