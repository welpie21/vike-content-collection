export { config as default }

import type { Config } from 'vike/types'

const config = {
  name: 'vike-content-collection',
  require: {
    vike: '>=0.4.250',
  },
  meta: {
    Content: {
      env: { server: true },
    },
  },
} satisfies Config

import './types/Config.js'
