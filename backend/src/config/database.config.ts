import { DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { EnvConfig } from "./env.schema";

export const createDataSource = (configService: ConfigService<EnvConfig>) => {
  return new DataSource({
    type: "postgres",
    host: configService.get("DB_HOST"),
    port: configService.get("DB_PORT"),
    username: configService.get("DB_USERNAME"),
    password: configService.get("DB_PASSWORD"),
    database: configService.get("DB_NAME"),
    entities: [__dirname + "/../**/*.entity{.ts,.js}"],
    migrations: [__dirname + "/migrations/*{.ts,.js}"],
    synchronize: false,
    logging: process.env.NODE_ENV === "development",
  });
};

// Создаем DataSource для миграций
const configService = new ConfigService<EnvConfig>();
const dataSource = createDataSource(configService);

export default dataSource;
