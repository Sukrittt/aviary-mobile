// waitFor's 1s default is too tight when the whole suite runs in parallel and
// screens render slowly; a real wait still resolves as soon as it passes.
require('@testing-library/react-native').configure({ asyncUtilTimeout: 5000 })
