// Английские версии ошибок API (запрос с lang=en).
// Источник: сервер инструментов hitz.agency (https://hitz.agency/tools).

/** Ошибки API и сети: русская строка (или ее начало, если дальше код ответа) -> английская. */
export const ERRORS_EN: Record<string, string> = {
  'Маршрут не найден': 'Route not found',
  'Метод не поддерживается': 'Method not supported',
  'Источник запроса не разрешен': 'Request origin not allowed',
  'Слишком много запросов. Попробуйте через минуту.': 'Too many requests. Try again in a minute.',
  'Сервис временно перегружен. Попробуйте через минуту.': 'The service is busy. Try again in a minute.',
  'Укажите адрес сайта': 'Enter the site URL',
  'Укажите название бренда': 'Enter the brand name',
  'Сайт отвечает слишком долго': 'The site takes too long to respond',
  'Не удалось проверить сайт': 'We could not check the site',
  'Не удалось загрузить llms.txt': 'Could not load llms.txt',
  'Не удалось загрузить robots.txt': 'Could not load robots.txt',
  'Не удалось загрузить главную страницу': 'Could not load the home page',
  'Некорректный адрес сайта': 'Invalid site URL',
  'Поддерживаются только http и https': 'Only http and https are supported',
  'Адрес не должен содержать логин или пароль': 'The URL must not contain a username or password',
  'Поддерживаются только стандартные веб-порты': 'Only standard web ports are supported',
  'Укажите публичный домен сайта': 'Enter a public domain',
  'Не удалось проверить адрес сайта': 'Could not verify the site address',
  'robots.txt превышает допустимый размер': 'robots.txt exceeds the size limit',
  'Слишком много перенаправлений': 'Too many redirects',
  'Некорректное перенаправление': 'Invalid redirect',
  'robots.txt вернул код': 'robots.txt returned status',
  'Главная страница отвечает кодом': 'The home page returned status',
  'Главная страница сайта недоступна или вернула не HTML': 'The home page is unavailable or did not return HTML',
  'Страница отвечает кодом': 'The page returned status',
  'По адресу открывается не HTML-страница': 'The URL does not return an HTML page',
  'По адресу открывается пустая HTML-страница': 'The URL returns an empty HTML page',
  'Проверка страниц недоступна на этом сервере': 'Page checks are not available on this server',
  'Некорректный JSON-LD': 'Invalid JSON-LD',
};

/** Тексты результатов, которых нет в словарях EN-страниц прода. */
export const RESULTS_EN: Record<string, string> = {
  // ai-crawler-check
  'Запрещающих правил нет': 'No disallow rules',
  // llms-txt
  'Сервер вернул ошибку': 'The server returned an error',
  'Проверьте публикацию файла и ответ сервера.': 'Check that the file is published and how the server responds.',
  'Структуру стоит дополнить': 'The structure needs work',
  'Нужны один H1 и разделы второго уровня.': 'The file needs one H1 and second-level sections.',
  'Добавьте строку описания после заголовка.': 'Add a description line after the heading.',
  'Добавьте абсолютные ссылки на ключевые страницы.': 'Add absolute links to key pages.',
  // geo-audit
  'Проверьте title, один H1, canonical, lang, viewport и запрет noindex.': 'Check the title, a single H1, canonical, lang, viewport, and noindex.',
  'База есть, но отдельные сигналы мешают странице стать надежным источником.': 'The base is there, but some signals keep the page from becoming a reliable source.',
  // brand-entity: карточки
  'Название бренда согласовано с основными элементами страницы.': 'The brand name matches the main elements of the page.',
  'Телефон и почта подтверждают организацию.': 'Phone and email confirm the organization.',
  'Официальные профили связаны с сайтом.': 'Official profiles are linked to the site.',
  // brand-entity: сигналы (в ответе API, страница их пока не выводит)
  'Сайт отвечает': 'The site responds',
  'Используется HTTPS': 'HTTPS is used',
  'Canonical ведет на основной домен': 'The canonical points to the primary domain',
  'Бренд указан в title': 'The brand is in the title',
  'Бренд указан в H1': 'The brand is in the H1',
  'og:site_name совпадает с брендом': 'og:site_name matches the brand',
  'Есть meta description': 'A meta description is present',
  'Есть Organization или LocalBusiness': 'Organization or LocalBusiness markup is present',
  'Название в разметке совпадает': 'The name in the markup matches',
  'URL в разметке совпадает с доменом': 'The URL in the markup matches the domain',
  'В разметке указан логотип': 'The markup includes a logo',
  'В разметке есть sameAs': 'The markup includes sameAs',
  'Связаны минимум два профиля': 'At least two profiles are linked',
  'На сайте указана почта': 'The site lists an email',
  'На сайте указан телефон': 'The site lists a phone number',
  'В разметке есть contactPoint': 'The markup includes contactPoint',
  'В разметке есть адрес': 'The markup includes an address',
  'Бренд найден в Wikidata': 'The brand is found in Wikidata',
};

/** Ошибка API по-английски: целиком или по началу строки (дальше - код ответа). Иначе - как есть. */
export function errorEn(message: string): string {
  const whole = ERRORS_EN[message];
  if (whole) return whole;
  for (const [ru, en] of Object.entries(ERRORS_EN)) if (message.startsWith(ru)) return en + message.slice(ru.length);
  return message;
}
