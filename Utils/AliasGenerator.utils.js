const { randomBytes } = require("crypto");

const ADJECTIVES = [
    "Silent", "Phantom", "Velvet", "Cosmic", "Neon", "Crimson", "Arctic",
    "Golden", "Shadow", "Amber", "Lunar", "Misty", "Steel", "Violet",
    "Cobalt", "Rustic", "Frosty", "Blazing", "Hollow", "Prism",
    "Wispy", "Drifting", "Electric", "Hidden", "Midnight", "Feral",
    "Crystal", "Ashen", "Radiant", "Onyx",
];

const NOUNS = [
    "Fox", "Wolf", "Raven", "Panda", "Lynx", "Hawk", "Mist", "Storm",
    "Drift", "Echo", "Flare", "Ghost", "Shade", "Spark", "Tide",
    "Veil", "Wraith", "Zephyr", "Blaze", "Cedar", "Dune", "Ember",
    "Frost", "Glyph", "Haze", "Ivory", "Jade", "Knoll", "Lark", "Marsh",
];

/**
 * Generates a random alias like "SilentFox#4821".
 * Uses crypto.randomBytes for uniform randomness.
 *
 * @returns {string}
 */
const generateAlias = () => {
    const buf = randomBytes(4);
    const adjIndex  = buf[0] % ADJECTIVES.length;
    const nounIndex = buf[1] % NOUNS.length;
    // 4-digit number 1000–9999
    const number = 1000 + ((buf.readUInt16BE(2)) % 9000);

    return `${ADJECTIVES[adjIndex]}${NOUNS[nounIndex]}#${number}`;
};

module.exports = { generateAlias };
