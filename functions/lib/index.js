"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.beforecreated = void 0;
const identity_1 = require("firebase-functions/v2/identity");
const https_1 = require("firebase-functions/v2/https");
const SFU_PRIMARY_DOMAIN = "sfu.ca";
const SFU_DOMAIN_ALLOWLIST = [SFU_PRIMARY_DOMAIN, "cs.sfu.ca"];
exports.beforecreated = (0, identity_1.beforeUserCreated)((event) => {
    const user = event.data;
    if (!user) {
        throw new https_1.HttpsError("invalid-argument", "No user data");
    }
    console.log('Blocking function triggered for:', user.email);
    const email = user.email;
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "Email is required");
    }
    const lowerEmail = email.toLowerCase();
    const parts = lowerEmail.split("@");
    if (parts.length !== 2) {
        throw new https_1.HttpsError("invalid-argument", "Invalid email format");
    }
    const [localPart, domain] = parts;
    if (!SFU_DOMAIN_ALLOWLIST.includes(domain)) {
        throw new https_1.HttpsError("permission-denied", "Only @sfu.ca emails are allowed.");
    }
    // Normalize email: remove aliases (plus tags) only for primary domain
    if (domain === SFU_PRIMARY_DOMAIN) {
        const plusIndex = localPart.indexOf("+");
        if (plusIndex !== -1) {
            const normalizedLocal = localPart.substring(0, plusIndex);
            const normalizedEmail = `${normalizedLocal}@${domain}`;
            return {
                email: normalizedEmail,
                emailVerified: true
            };
        }
    }
    return {};
});
//# sourceMappingURL=index.js.map