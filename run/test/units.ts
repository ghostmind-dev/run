import { assertEquals } from 'jsr:@std/assert';
import { encrypt, decrypt, createUUID } from '../utils/divers.ts';

Deno.test('decrypt', () => {
  const TEST_DECRYPTED_SECRET = Deno.env.get('TEST_DECRYPTED_SECRET');
  const TEST_CRYPTO_SECRET_KEY = Deno.env.get('TEST_CRYPTO_SECRET_KEY');

  if (!TEST_DECRYPTED_SECRET || !TEST_CRYPTO_SECRET_KEY) {
    throw new Error('missing environment variables');
  }

  const encrypted = encrypt(TEST_DECRYPTED_SECRET, TEST_CRYPTO_SECRET_KEY);

  const decrypted = decrypt(encrypted, TEST_CRYPTO_SECRET_KEY);

  assertEquals(decrypted, TEST_DECRYPTED_SECRET);
});
