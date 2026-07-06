import { redisConnectionOptions } from './redis';

describe('redisConnectionOptions', () => {
  afterEach(() => {
    delete process.env.REDIS_URL;
  });

  it('defaults to localhost:6379', () => {
    expect(redisConnectionOptions()).toMatchObject({
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it('parses host, port and credentials from REDIS_URL', () => {
    process.env.REDIS_URL = 'redis://user:secret@redis.internal:6380';
    expect(redisConnectionOptions()).toMatchObject({
      host: 'redis.internal',
      port: 6380,
      username: 'user',
      password: 'secret',
    });
  });
});
