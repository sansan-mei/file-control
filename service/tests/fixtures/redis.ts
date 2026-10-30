// Deliberately does not import the Redis package: tests must never open a Redis socket.
export const client = {
  async get(key: string) {
    return key === 'admin' ? 'test-admin-token' : null
  }
}
