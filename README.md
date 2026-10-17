# Power Outages Schedule Tracker

Моніторинг графіку планових відключень електроенергії для черги 1.1 Дніпровських електромереж.
Усуває необхідність введення адреси при кожному відвідуванні сторінки з графіками.

## Можливості

- 📅 Відображення графіку відключень на сьогодні та завтра
- ⚡ Автоматичне отримання даних ДТЕК та Yasno через GitHub Actions
- 🎨 Сучасний та зручний інтерфейс
- 📱 Адаптивний дизайн для мобільних пристроїв

## Як працює

1. **GitHub Actions** запускає отримання даних ДТЕК та Yasno за розкладом кожні 6 хвилин (фактичні запуски можуть затримуватися на стороні GitHub).
2. Графік ДТЕК читається з `DisconSchedule.fact` у HTML сторінки без запуску браузера; мережеві помилки та HTTP-помилки повторюються до 3 разів.
3. Дані зберігаються у `data/dtek-outages.json` та `data/outages.json`. Некоректна відповідь ДТЕК не перезаписує попередні дані; коректний порожній графік публікується як `days: []`.
4. SPA завантажує оновлення кожні 5 хвилин, поки сторінка видима, та відразу після повернення до неї.

## Використання

Просто відкрийте `index.html` у браузері або налаштуйте GitHub Pages для автоматичного розгортання.

Демо: https://norivka.github.io/

## Розробка

### Локальне тестування обробки даних

Для ДТЕК (Node.js 24, без додаткових npm-залежностей):

```bash
curl --fail --location --silent --show-error \
  --retry 3 --retry-all-errors --retry-delay 5 \
  --connect-timeout 15 --max-time 60 \
  "https://www.dtek-dnem.com.ua/ua/shutdowns" -o raw-dtek-data.html
node process-dtek-data.js
node --test process-dtek-data.test.js
```

Для Yasno:

```bash
# Завантажити тестові дані
curl "https://app.yasno.ua/api/blackout-service/public/shutdowns/regions/3/dsos/301/planned-outages" -o raw-data.json

# Обробити дані
node process-data.js
```

## Технології

- Vanilla JavaScript (без фреймворків)
- GitHub Actions для автоматизації
- LocalStorage для порівняння змін

## Налаштування для іншого регіону

Змініть URL в `.github/workflows/update-outages.yml`:
- `regions/3` - ваш регіон
- `dsos/301` - ваш DSO
- `elementName === '1.1'` в `process-data.js` - ваша група
