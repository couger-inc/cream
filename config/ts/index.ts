import * as path from 'path'

if (!process.env.hasOwnProperty('NODE_CONFIG_DIR')) {
    process.env.NODE_CONFIG_DIR = path.join(__dirname, '../')
}

if (!process.env.hasOwnProperty('NODE_ENV')) {
    process.env.NODE_ENV = 'test'
}

const config = require('config')

export { config }
