const base = require("@repo/eslint-config");

module.exports = [...base, base.noDirectDbImport];
