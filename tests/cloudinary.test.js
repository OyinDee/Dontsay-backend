const mockCloudinaryConfig = {};
const mockUpload = jest.fn();

jest.unmock("../Utils/Cloudinary.utils");
jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn((options) => {
      if (options) Object.assign(mockCloudinaryConfig, options);
      return mockCloudinaryConfig;
    }),
    uploader: { upload: (...args) => mockUpload(...args) },
  },
}));

const credentialNames = [
  "CLOUDINARY_URL",
  "CLOUDINARY_ACCOUNT_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUD_NAME",
  "API_KEY",
  "API_SECRET",
];
const originalEnvironment = Object.fromEntries(
  credentialNames.map((name) => [name, process.env[name]])
);

beforeEach(() => {
  credentialNames.forEach((name) => { process.env[name] = ""; });
  Object.keys(mockCloudinaryConfig).forEach((key) => delete mockCloudinaryConfig[key]);
  mockUpload.mockReset();
  jest.resetModules();
});

afterAll(() => {
  credentialNames.forEach((name) => {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  });
});

describe("Cloudinary uploads", () => {
  it("reports missing backend credentials before attempting an upload", async () => {
    const { uploadToCloudinary } = require("../Utils/Cloudinary.utils");

    await expect(
      uploadToCloudinary("data:image/png;base64,aW1hZ2U=")
    ).rejects.toThrow(
      "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET"
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("uses standard Cloudinary environment variable names", async () => {
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    mockUpload.mockResolvedValue({ secure_url: "https://image.test/photo.jpg" });

    const { uploadToCloudinary } = require("../Utils/Cloudinary.utils");
    await expect(
      uploadToCloudinary("data:image/png;base64,aW1hZ2U=")
    ).resolves.toBe("https://image.test/photo.jpg");
    expect(mockUpload).toHaveBeenCalledWith("data:image/png;base64,aW1hZ2U=");
  });
});
