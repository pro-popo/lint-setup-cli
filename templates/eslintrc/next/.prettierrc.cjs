/** @type {import("prettier").Config} */
const base = require("../base/prettier.base.cjs");

module.exports = {
  ...base,
  plugins: [...(base.plugins || []), "prettier-plugin-tailwindcss"],
  tailwindFunctions: ["clsx", "cva", "cn"]
};

