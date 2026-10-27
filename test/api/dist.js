// Imported with node --test --import: the tests under test/api run against the
// bundles in dist (test/api/target.js). The variable reaches the processes of
// the test files, which inherit the environment.
process.env.LAYOUT_DATA_TEST_TARGET = "dist";
