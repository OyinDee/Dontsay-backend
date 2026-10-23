const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key:    process.env.API_KEY,
    api_secret: process.env.API_SECRET,
});

/**
 * Uploads a base64-encoded image string to Cloudinary.
 * Returns the secure URL, or null if no image was provided.
 *
 * @param {string|null|undefined} base64String
 * @returns {Promise<string|null>}
 */
const uploadToCloudinary = async (base64String) => {
    if (!base64String) return null;
    const result = await cloudinary.uploader.upload(base64String);
    return result.secure_url;
};

const uploadAudioToCloudinary = async (base64String) => {
    if (!base64String) return null;
    const result = await cloudinary.uploader.upload(base64String, { resource_type: "video" });
    return result.secure_url;
};

module.exports = { uploadToCloudinary, uploadAudioToCloudinary, cloudinary };
