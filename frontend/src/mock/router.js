import { ApiError } from '../api'

// Simulate realistic network latency (150 - 400 ms)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const randomLatency = () => delay(150 + Math.floor(Math.random() * 251))

// Main mock router that intercepts API calls in demo mode
export async function mockRequest(path, { token, method = 'GET', body } = {}) {
  await randomLatency()

  const normalizedPath = path.split('?')[0]

  if (method === 'GET' && normalizedPath === '/health') {
    return { status: 'ok' }
  }

  throw new ApiError(404, `Mock endpoint not found: ${method} ${path}`)
}
