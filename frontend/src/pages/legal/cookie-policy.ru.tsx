// Unreviewed machine translation of cookie-policy.en.tsx; needs legal review before relying on it.
import type { LegalContent } from "./types";

export const cookiePolicyRu: LegalContent = {
  title: "Политика использования файлов cookie",
  seoDescription:
    "Политика использования файлов cookie ReceiptMaster — как мы используем cookie и локальное хранилище на нашей платформе.",
  body: (
    <>
      <h2>1. Что такое файлы cookie</h2>
      <p>
        Файлы cookie — это небольшие текстовые файлы, которые размещаются на
        вашем устройстве при посещении веб-сайта. Они широко используются для
        эффективной работы веб-сайтов и для передачи информации их операторам.
      </p>
      <p>
        Настоящая Политика использования файлов cookie объясняет, как
        ReceiptMaster (<a href="https://receiptmaster.org">receiptmaster.org</a>
        ), которым управляет FOP Pavlenko Andrii Volodymyrovych, использует
        файлы cookie и аналогичные технологии.
      </p>

      <h2>2. Какие файлы cookie мы используем</h2>

      <h3>2.1 Строго необходимые файлы cookie</h3>
      <p>
        Эти файлы cookie необходимы для работы Сервиса, и их нельзя отключить. К
        ним относятся:
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Назначение</th>
              <th>Срок хранения</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CSRF token</td>
              <td>Предотвращает атаки межсайтовой подделки запросов</td>
              <td>Сеанс</td>
            </tr>
            <tr>
              <td>Theme preference</td>
              <td>Запоминает ваш выбор светлого/тёмного режима</td>
              <td>1 год</td>
            </tr>
            <tr>
              <td>Language preference</td>
              <td>Запоминает выбранный вами язык</td>
              <td>1 год</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>2.2 Функциональные файлы cookie</h3>
      <p>
        Эти файлы cookie обеспечивают расширенную функциональность и
        персонализацию:
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Cookie</th>
              <th>Назначение</th>
              <th>Срок хранения</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>UI state</td>
              <td>
                Запоминает состояние боковой панели, настройки таблиц и
                параметры фильтров
              </td>
              <td>1 год</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>2.3 Сторонние файлы cookie</h3>
      <p>
        При взаимодействии с платёжным окном Paddle (checkout overlay) Paddle
        может устанавливать файлы cookie для обработки платежей и предотвращения
        мошенничества. Эти файлы cookie регулируются{" "}
        <a
          href="https://www.paddle.com/legal/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          Политикой конфиденциальности Paddle
        </a>
        .
      </p>

      <h2>3. Локальное хранилище</h2>
      <p>
        Помимо файлов cookie, мы используем локальное хранилище браузера для
        хранения:
      </p>
      <ul>
        <li>
          Токенов аутентификации (JWT) — позволяют вам оставаться в своей учётной
          записи
        </li>
        <li>Пользовательских настроек (тема, язык)</li>
        <li>Кэшированного состояния приложения для повышения производительности</li>
      </ul>
      <p>
        Данные локального хранилища остаются на вашем устройстве, пока вы не
        очистите данные браузера или не выйдете из Сервиса.
      </p>

      <h2>4. Что мы не используем</h2>
      <p>
        ReceiptMaster <strong>не</strong> использует:
      </p>
      <ul>
        <li>Рекламные или отслеживающие файлы cookie</li>
        <li>Сторонние аналитические сервисы (Google Analytics и т. п.)</li>
        <li>Пиксели отслеживания социальных сетей</li>
        <li>Технологии межсайтового отслеживания</li>
      </ul>

      <h2>5. Управление файлами cookie</h2>
      <p>
        Вы можете управлять файлами cookie и удалять их через настройки
        браузера. Большинство браузеров позволяют:
      </p>
      <ul>
        <li>Просматривать и удалять существующие файлы cookie</li>
        <li>Блокировать все файлы cookie или только сторонние</li>
        <li>Задавать настройки для отдельных веб-сайтов</li>
      </ul>
      <p>
        Обратите внимание: блокировка строго необходимых файлов cookie может
        нарушить корректную работу Сервиса (например, вы не сможете оставаться в
        своей учётной записи).
      </p>
      <p>Инструкции по управлению файлами cookie в вашем браузере:</p>
      <ul>
        <li>
          <a
            href="https://support.google.com/chrome/answer/95647"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Chrome
          </a>
        </li>
        <li>
          <a
            href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mozilla Firefox
          </a>
        </li>
        <li>
          <a
            href="https://support.apple.com/en-us/HT201265"
            target="_blank"
            rel="noopener noreferrer"
          >
            Safari
          </a>
        </li>
        <li>
          <a
            href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09"
            target="_blank"
            rel="noopener noreferrer"
          >
            Microsoft Edge
          </a>
        </li>
      </ul>

      <h2>6. Изменения в настоящей политике</h2>
      <p>
        Мы можем время от времени обновлять настоящую Политику использования
        файлов cookie. Изменения будут опубликованы на этой странице с
        обновлённой датой «Последнее обновление».
      </p>

      <h2>7. Контакты</h2>
      <p>
        Если у вас есть вопросы об использовании нами файлов cookie, свяжитесь с
        нами:
      </p>
      <ul>
        <li>
          <strong>Email:</strong>{" "}
          <a href="mailto:fluxlab@flux-lab.dev">fluxlab@flux-lab.dev</a>
        </li>
        <li>
          <strong>Оператор:</strong> FOP Pavlenko Andrii Volodymyrovych
        </li>
        <li>
          <strong>Местонахождение:</strong> Бровары, Киевская область, Украина
        </li>
      </ul>
    </>
  ),
};
