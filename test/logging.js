var LEVELS = {
  FATAL: 60,
  ERROR: 50,
  WARN: 40,
  INFO: 30,
  DEBUG: 20,
  TRACE: 10
};

var vows = require('vows'),
    assert = require('assert');

// Macro to initialize the logger topic.
function init(level) {
  GLOBAL.config = { args: { log: level.toLowerCase() } };
  var logger = require('../lib/logging.js').log;
  // Need to delete require cache so we could require it again in next tests
  delete require.cache[require.resolve('../lib/logging.js')];
  return logger;
}
// Macro to assert the logger's level.
function assertLevel(level) {
  return function(logger) {
    assert.equal(logger.level(), level);
  };
}
// Macro to return a test context for a logging level.
function ensureLevel(actual, expected) {
  if (!expected) { expected = actual; }
  var context = {
    topic: init(actual)
  };
  context['gets ' + expected] = assertLevel(LEVELS[expected]);
  return context;
}

exports.levelsTestSuite = vows
.describe('Setting log level to')
// Run each text in batch to ensure sequential operations.
.addBatch({
  'FATAL': ensureLevel('FATAL')
})
.addBatch({
  'ERROR': ensureLevel('ERROR')
})
.addBatch({
  'WARN': ensureLevel('WARN')
})
.addBatch({
  'INFO': ensureLevel('INFO')
})
.addBatch({
  'DEBUG': ensureLevel('DEBUG')
})
.addBatch({
  'TRACE': ensureLevel('TRACE')
})
.addBatch({
  'EVENT': ensureLevel('EVENT', 'INFO')
})
.addBatch({
  'VERBOSE': ensureLevel('VERBOSE', 'DEBUG')
});