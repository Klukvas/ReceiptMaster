import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { UsersService } from "../modules/users/users.service";
import * as bcrypt from "bcrypt";

async function createUser() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const usersService = app.get(UsersService);

  try {
    const email = process.argv[2] || "admin@example.com";
    const _password = process.argv[3] || "password123";
    const firstName = process.argv[4] || "Admin";
    const lastName = process.argv[5] || "User";

    // Check if user already exists
    const existingUser = await usersService.findByEmail(email);
    if (existingUser) {
      return;
    }

    // Create user directly in database
    const _hashedPassword = await bcrypt.hash(_password, 10);

    // You would need to inject the User repository here
    // For now, let's use the service method
    const _result = await usersService.register({
      email,
      password: _password,
      firstName,
      lastName,
    });
  } catch (error) {
    console.error("Error creating user:", error.message);
  } finally {
    await app.close();
  }
}

createUser();
