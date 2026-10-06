// Модульные тесты сети: какие адреса проверка пускает (только публичные сайты) и какие IP блокирует.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertPublicWebsiteUrl, isBlockedIpv4Address, isBlockedIpv6Address } from '../src/core/net.ts';

test('assertPublicWebsiteUrl пропускает публичный домен', () => {
  assert.equal(assertPublicWebsiteUrl('https://example.com/path?q=1').hostname, 'example.com');
});

for (const [input, message] of [
  ['не адрес', 'Некорректный адрес сайта'],
  ['ftp://example.com', 'Поддерживаются только http и https'],
  ['https://user:pass@example.com', 'Адрес не должен содержать логин или пароль'],
  ['https://example.com:8080', 'Поддерживаются только стандартные веб-порты'],
  ['http://localhost', 'Укажите публичный домен сайта'],
  ['http://127.0.0.1', 'Укажите публичный домен сайта'],
  ['http://[::1]', 'Укажите публичный домен сайта'],
  ['http://router.lan', 'Укажите публичный домен сайта'],
  ['http://intranet', 'Укажите публичный домен сайта'],
]) {
  test(`assertPublicWebsiteUrl отклоняет ${input}`, () => {
    assert.throws(() => assertPublicWebsiteUrl(input), { name: 'TypeError', message });
  });
}

test('частные и служебные IPv4 блокируются, публичные - нет', () => {
  for (const ip of ['10.1.2.3', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '300.1.1.1']) {
    assert.equal(isBlockedIpv4Address(ip), true, ip);
  }
  for (const ip of ['93.184.215.14', '1.1.1.1', '8.8.8.8']) {
    assert.equal(isBlockedIpv4Address(ip), false, ip);
  }
});

test('частные и служебные IPv6 блокируются, публичные - нет', () => {
  for (const ip of ['::1', '::', 'fd00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1']) {
    assert.equal(isBlockedIpv6Address(ip), true, ip);
  }
  assert.equal(isBlockedIpv6Address('2606:4700:4700::1111'), false);
});
