import { NestFactory } from "@nestjs/core";
import { getDataSourceToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { AppModule } from "../app.module";
import { UsersService } from "../modules/users/users.service";
import { ProductsService } from "../modules/products/products.service";
import { RecipientsService } from "../modules/recipients/recipients.service";
import { OrdersService } from "../modules/orders/orders.service";
import { Currency } from "../modules/products/entities/product.entity";
import { Order } from "../modules/orders/entities/order.entity";
import { OrderStatus } from "../modules/orders/entities/order.entity";
import { randomBytes } from "crypto";

function randomAlphanumeric(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...randomBytes(length)]
    .map((b) => chars[b % chars.length])
    .join("");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length - 1)];
}

function randomDateInLastMonths(months: number): Date {
  const now = new Date();
  const past = new Date(now);
  past.setMonth(past.getMonth() - months);
  const ts = past.getTime() + Math.random() * (now.getTime() - past.getTime());
  return new Date(ts);
}

const SEED_PRODUCTS = [
  { name: "Хліб білий", purchase: 1200, sale: 1800 },
  { name: "Молоко 2.5%", purchase: 2500, sale: 3200 },
  { name: "Сир твердий", purchase: 18000, sale: 22000 },
  { name: "Курка філе", purchase: 9500, sale: 13000 },
  { name: "Яйця 10 шт", purchase: 4500, sale: 5800 },
  { name: "Олія соняшникова", purchase: 5500, sale: 7200 },
  { name: "Цукор", purchase: 2800, sale: 3500 },
  { name: "Борошно", purchase: 2200, sale: 3000 },
  { name: "Кава мелена", purchase: 8500, sale: 12000 },
  { name: "Чай чорний", purchase: 3500, sale: 4800 },
  { name: "Печиво", purchase: 4000, sale: 5500 },
  { name: "Йогурт натуральний", purchase: 1800, sale: 2500 },
  { name: "Сметана 20%", purchase: 4200, sale: 5500 },
  { name: "Ковбаса варена", purchase: 12000, sale: 15500 },
  { name: "Картопля", purchase: 800, sale: 1200 },
  { name: "Цибуля", purchase: 600, sale: 900 },
  { name: "Морква", purchase: 700, sale: 1000 },
  { name: "Яблука", purchase: 3500, sale: 5000 },
  { name: "Банани", purchase: 4000, sale: 5500 },
  { name: "Вода мінеральна 1.5л", purchase: 1200, sale: 1800 },
];

const SEED_RECIPIENTS = [
  { name: "ТОВ Рога та Копита", email: "office@roga-kopyta.ua", phone: "+380441234567", address: "м. Київ, вул. Хрещатик, 1" },
  { name: "ПП Петренко І.В.", email: "petrenko@gmail.com", phone: "+380671112233", address: "м. Львів, вул. Франка, 15" },
  { name: "ФОП Сидоренко О.П.", email: "sydorenko@ukr.net", phone: "+380931234567", address: "м. Одеса, вул. Дерибасівська, 22" },
  { name: "ТОВ Зелений Луг", email: "info@greenmeadow.ua", phone: "+380502223344", address: "м. Харків, пр. Науки, 45" },
  { name: "ПП Коваленко М.С.", email: "koval@i.ua", phone: "+380633334455", address: "м. Дніпро, вул. Яворницького, 30" },
  { name: "ТОВ ТехноМаркет", email: "sales@technomarket.ua", phone: "+380444445566", address: "м. Київ, вул. Велика Васильківська, 72" },
  { name: "ФОП Мельник Т.І.", email: "melnyk.t@gmail.com", phone: "+380967778899", address: "м. Вінниця, вул. Соборна, 50" },
  { name: "ТОВ Агро-Сервіс", email: "agro@agroservis.ua", phone: "+380561112233", address: "м. Полтава, вул. Европейська, 10" },
  { name: "ПП Шевченко В.В.", email: "shevchenko.v@ukr.net", phone: "+380931234500", address: "м. Запоріжжя, пр. Соборний, 100" },
  { name: "ТОВ Мрія", email: "info@mriya.ua", phone: "+380672223344", address: "м. Чернігів, вул. Шевченка, 5" },
  { name: "ФОП Бондаренко А.О.", email: "bondar@gmail.com", phone: "+380504445566", address: "м. Суми, вул. Петропавлівська, 18" },
  { name: "ТОВ Еко-Продукт", email: "eco@ecoproduct.ua", phone: "+380635556677", address: "м. Черкаси, бул. Шевченка, 200" },
  { name: "ПП Ткаченко Л.М.", email: "tkachenko@i.ua", phone: "+380937778899", address: "м. Житомир, вул. Київська, 77" },
  { name: "ТОВ Вінниця-Хліб", email: "bread@vinnytsia.ua", phone: "+380431112233", address: "м. Вінниця, вул. Козицького, 25" },
  { name: "ФОП Савченко І.П.", email: "savchenko.i@gmail.com", phone: "+380661234567", address: "м. Кропивницький, вул. Преображенська, 12" },
  { name: "ТОВ Регіон Постач", email: "region@region.ua", phone: "+380574445566", address: "м. Миколаїв, вул. Адміральська, 30" },
  { name: "ПП Грищенко О.К.", email: "hryshchenko@ukr.net", phone: "+380937778800", address: "м. Херсон, вул. Ушакова, 45" },
  { name: "ТОВ Південний", email: "info@pivdennyi.ua", phone: "+380482223344", address: "м. Одеса, вул. Пушкінська, 20" },
  { name: "ФОП Лисенко П.С.", email: "lysenko.p@gmail.com", phone: "+380501112233", address: "м. Чернівці, вул. Главна, 88" },
  { name: "ТОВ Карпати Трейд", email: "trade@karpaty.ua", phone: "+380324445566", address: "м. Івано-Франківськ, вул. Незалежності, 15" },
  { name: "ПП Кравченко Н.В.", email: "kravchenko@i.ua", phone: "+380967778811", address: "м. Луцьк, вул. Винниченка, 33" },
  { name: "ТОВ Славутич", email: "slavutych@slavutych.ua", phone: "+380462223355", address: "м. Чернігів, пр. Перемоги, 100" },
  { name: "ФОП Олійник Р.М.", email: "oliynyk@gmail.com", phone: "+380631234567", address: "м. Рівне, вул. Соборна, 42" },
  { name: "ТОВ Тернопіль-Холд", email: "hold@ternopil.ua", phone: "+380352223344", address: "м. Тернопіль, вул. Руська, 20" },
  { name: "ПП Марченко С.О.", email: "marchenko.s@ukr.net", phone: "+380931112244", address: "м. Ужгород, вул. Корзо, 5" },
];

const SIX_MONTHS = 6;
const NUM_ORDERS = 100;
const CONFIRMED_PCT = 0.7;
const CANCELLED_PCT = 0.1;
// rest are draft

async function createUser() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);
  const productsService = app.get(ProductsService);
  const recipientsService = app.get(RecipientsService);
  const ordersService = app.get(OrdersService);
  const dataSource = app.get(getDataSourceToken()) as DataSource;
  const orderRepo = dataSource.getRepository(Order);

  try {
    const email =
      process.argv[2] || `seed-${Date.now()}-${randomAlphanumeric(6)}@example.com`;
    const password = process.argv[3] || randomAlphanumeric(12);

    await usersService.register({ email, password });

    const user = await usersService.findByEmail(email);
    if (!user) {
      throw new Error("User was not found after registration");
    }

    // Seed products (high quantity for many orders)
    const products: Awaited<ReturnType<ProductsService["create"]>>[] = [];
    for (const p of SEED_PRODUCTS) {
      const product = await productsService.create(
        {
          name: p.name,
          purchase_price_cents: p.purchase * 100,
          sale_price_cents: p.sale * 100,
          quantity: randomInt(1500, 3500),
          currency: Currency.UAH,
        },
        user,
      );
      products.push(product);
    }

    // Seed recipients
    const recipients: Awaited<ReturnType<RecipientsService["create"]>>[] = [];
    for (const r of SEED_RECIPIENTS) {
      const recipient = await recipientsService.create(
        { name: r.name, email: r.email, phone: r.phone, address: r.address },
        user,
      );
      recipients.push(recipient);
    }

    // Create many orders, then backdate and set status
    const createdOrders: { id: string; createdAt: Date }[] = [];
    for (let i = 0; i < NUM_ORDERS; i++) {
      const recipient = randomElement(recipients);
      const numItems = randomInt(1, 4);
      const chosenProducts = new Map<string, number>();
      for (let j = 0; j < numItems; j++) {
        const product = randomElement(products);
        const qty = randomInt(1, 3);
        chosenProducts.set(product.id, (chosenProducts.get(product.id) ?? 0) + qty);
      }
      const items = Array.from(chosenProducts.entries()).map(([productId, qty]) => ({
        productId,
        qty,
      }));

      const result = await ordersService.create(
        { recipientId: recipient.id, items },
        user,
      );
      const order = result.data as Order;
      createdOrders.push({ id: order.id, createdAt: order.created_at });
    }

    // Backdate orders and set status (confirmed / cancelled / draft)
    for (let i = 0; i < createdOrders.length; i++) {
      const pastDate = randomDateInLastMonths(SIX_MONTHS);
      const r = Math.random();
      const status =
        r < CONFIRMED_PCT
          ? OrderStatus.CONFIRMED
          : r < CONFIRMED_PCT + CANCELLED_PCT
            ? OrderStatus.CANCELLED
            : OrderStatus.DRAFT;
      await orderRepo.update(
        { id: createdOrders[i].id },
        {
          created_at: pastDate,
          updated_at: pastDate,
          status,
        },
      );
    }

    console.log("User created successfully.");
    console.log("Email:", email);
    console.log("Password:", password);
    console.log(
      `Seeded: ${products.length} products, ${recipients.length} recipients, ${NUM_ORDERS} orders (last ${SIX_MONTHS} months).`,
    );
  } catch (error) {
    console.error("Error creating user:", (error as Error).message);
  } finally {
    await app.close();
  }
}

createUser();
