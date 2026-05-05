require('dotenv').config()
const { ensureSchemaInitialized } = require('../src/db/ensureSchema')
const { closeDb } = require('../src/db/getDb')

try {
  ensureSchemaInitialized()
  console.log('schema ensured')
} finally {
  closeDb()
}
