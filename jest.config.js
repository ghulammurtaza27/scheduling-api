module.exports = {
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./src/tests/setup.js'],
  testMatch: ['**/__tests__/**/*.js', '**/*.test.js'],
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 10000,
  // Add this if you're using ES modules
  // transform: {
  //   '^.+\\.js$': 'babel-jest',
  // },
}; 