/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY || '',
  },
}

module.exports = nextConfig