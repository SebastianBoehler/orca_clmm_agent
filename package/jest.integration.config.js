const base = require("./jest.config");

module.exports = {
  ...base,
  testMatch: ["**/*.integration.test.ts"],
  testPathIgnorePatterns: ["/dist/", "/examples/"],
};
