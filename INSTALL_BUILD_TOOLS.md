# Установка инструментов для сборки нативных модулей

## Проблема: "not found: make"

Ошибка означает, что на сервере не установлены инструменты для компиляции нативных модулей (C/C++).

---

## Решение: Установите build-essential

```bash
# Обновите список пакетов
sudo apt update

# Установите build-essential (включает make, gcc, g++ и другие инструменты)
sudo apt install -y build-essential

# Также установите Python (обычно уже есть, но на всякий случай)
sudo apt install -y python3

# Для некоторых модулей может понадобиться
sudo apt install -y pkg-config
```

---

## После установки попробуйте снова

```bash
# Очистите кеш npm
npm cache clean --force

# Удалите node_modules (если частично установились)
rm -rf node_modules package-lock.json

# Установите зависимости заново
npm install
```

---

## Полный список команд

```bash
# 1. Установите инструменты сборки
sudo apt update
sudo apt install -y build-essential python3 pkg-config

# 2. Очистите и переустановите зависимости
cd /var/www/yana_app
rm -rf node_modules package-lock.json
npm cache clean --force

# 3. Установите зависимости
npm install

# 4. Если всё успешно, соберите проект
npm run build
```

---

## Что устанавливается

- **build-essential**: включает:
  - `make` - система сборки
  - `gcc` - компилятор C
  - `g++` - компилятор C++
  - `libc6-dev` - библиотеки разработки
  - И другие необходимые инструменты

- **python3**: нужен для node-gyp (инструмент для сборки нативных модулей)

- **pkg-config**: помогает находить библиотеки при компиляции

---

## Время установки

Установка `build-essential` может занять 2-5 минут, так как это большой пакет.

---

**После установки build-essential, npm install должен пройти успешно.**
