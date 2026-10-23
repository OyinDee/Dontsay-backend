const cloudinary = require("cloudinary").v2;
require("dotenv").config();

const cloudinaryConfig = Object.fromEntries(
    Object.entries({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY || process.env.API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET || process.env.API_SECRET,
    }).filter(([, value]) => value)
);

cloudinary.config(cloudinaryConfig);

const requireCloudinaryConfig = () => {
    const config = cloudinary.config();
    const missing = ["cloud_name", "api_key", "api_secret"].filter(
        (key) => !config[key]
    );
    if (missing.length) {
        throw new Error(
            "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, " +
            "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the backend environment."
        );
    }
};

/**
 * Uploads a base64-encoded image string to Cloudinary.
 * Returns the secure URL, or null if no image was provided.
 *
 * @param {string|null|undefined} base64String
 * @returns {Promise<string|null>}
 */
const uploadToCloudinary = async (base64String) => {
    if (!base64String) return null;
    requireCloudinaryConfig();
    const result = await cloudinary.uploader.upload(base64String);
    return result.secure_url;
};

const uploadAudioToCloudinary = async (base64String) => {
    if (!base64String) return null;
    requireCloudinaryConfig();
    const result = await cloudinary.uploader.upload(base64String, { resource_type: "video" });
    return result.secure_url;
};

module.exports = { uploadToCloudinary, uploadAudioToCloudinary, cloudinary };
