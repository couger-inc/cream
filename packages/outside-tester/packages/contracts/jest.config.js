module.exports = {
    verbose: true,
    transform: {
        "^.+\\.tsx?$": 'ts-jest'
    },
    testPathIgnorePatterns: [
        "<rootDir>/build/",
        "/node_modules/",
    ],
    testRegex: 'ts/__tests__/.*\\.test\\.ts$',
    moduleFileExtensions: [
        'ts',
        'tsx',
        'js',
        'jsx',
        'json',
        'node'
    ],
    moduleNameMapper: {
       "^@maci-contracts(.*)$": "<rootDir>./$1",
    },
    globals: {
        'ts-jest': {
            diagnostics: {
                // Do not fail on TS compilation errors
                // https://kulshekhar.github.io/ts-jest/user/config/diagnostics#do-not-fail-on-first-error
                warnOnly: true
            }
        }
    },
    testEnvironment: 'node'
}
