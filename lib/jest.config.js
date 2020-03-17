module.exports = {
  verbose: true,
  preset: 'ts-jest',
  testPathIgnorePatterns: [
    '/build/',
    '/node_modules'
  ],
  testRegex: '/__tests__/.*\\.test\\.ts$',
  testEnvironment: 'node',
}
