module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.js?(x)',
    '**/?(*.)+(spec|test).js?(x)'
  ],
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  rootDir: '../../'
};
