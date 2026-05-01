import { beforeEach, describe, expect, it, vi } from 'vitest'

const post = vi.fn()
const setAuthToken = vi.fn()

vi.mock('../src/api/index.js', () => ({
  api: { post },
  setAuthToken,
  clearAuthToken: vi.fn(),
  getAuthToken: vi.fn(),
}))

describe('auth api contract', () => {
  beforeEach(() => {
    post.mockReset()
    setAuthToken.mockReset()
  })

  it('maps the register form nickname to the backend username field', async () => {
    post.mockResolvedValue({ token: 'token-1' })
    const { register } = await import('../src/api/auth.js')

    await register({ email: 'writer@example.com', password: '123456', nickname: '作家' })

    expect(post).toHaveBeenCalledWith('/auth/register', {
      email: 'writer@example.com',
      password: '123456',
      username: '作家',
    })
    expect(setAuthToken).toHaveBeenCalledWith('token-1')
  })
})
