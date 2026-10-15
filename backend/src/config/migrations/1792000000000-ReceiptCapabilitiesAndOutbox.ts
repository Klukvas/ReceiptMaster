import { MigrationInterface, QueryRunner } from "typeorm";

export class ReceiptCapabilitiesAndOutbox1792000000000
  implements MigrationInterface
{
  name = "ReceiptCapabilitiesAndOutbox1792000000000";
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `CREATE TABLE IF NOT EXISTS tg_updates(processed_update_id BIGINT PRIMARY KEY, processed_at TIMESTAMPTZ DEFAULT now())`,
    );
    await runner.query(
      `ALTER TABLE receipts ADD COLUMN IF NOT EXISTS generation_id uuid, ADD COLUMN IF NOT EXISTS generation_started_at timestamptz`,
    );
    await runner.query(`CREATE TABLE IF NOT EXISTS receipt_generation_outbox (
      id uuid PRIMARY KEY, receipt_id uuid NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
      order_id uuid NOT NULL, user_id uuid NOT NULL, generation_id uuid NOT NULL,
      published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(receipt_id, generation_id)
    )`);
    await runner.query(
      `CREATE INDEX IF NOT EXISTS receipt_outbox_pending ON receipt_generation_outbox(created_at)`,
    );
    const receipt = `public_token = NULLIF(current_setting('app.public_receipt_token', true), '') AND status = 'generated'`;
    await runner.query(
      `CREATE POLICY public_receipt_read ON receipts FOR SELECT USING (${receipt})`,
    );
    await runner.query(
      `CREATE POLICY public_order_read ON orders FOR SELECT USING (EXISTS (SELECT 1 FROM receipts r WHERE r.order_id = orders.id AND r.public_token = NULLIF(current_setting('app.public_receipt_token', true), '') AND r.status = 'generated'))`,
    );
    await runner.query(
      `CREATE POLICY public_item_read ON order_items FOR SELECT USING (EXISTS (SELECT 1 FROM receipts r WHERE r.order_id = order_items.order_id AND r.public_token = NULLIF(current_setting('app.public_receipt_token', true), '') AND r.status = 'generated'))`,
    );
    await runner.query(
      `CREATE POLICY public_recipient_read ON recipients FOR SELECT USING (EXISTS (SELECT 1 FROM orders o JOIN receipts r ON r.order_id = o.id WHERE o.recipient_id = recipients.id AND r.public_token = NULLIF(current_setting('app.public_receipt_token', true), '') AND r.status = 'generated'))`,
    );
    // Upgrade pending work too; legacy queue payloads are fenced by a fresh generation.
    await runner.query(
      `UPDATE receipts SET generation_id = uuid_generate_v4(), generation_started_at = now() WHERE status = 'processing' AND generation_id IS NULL`,
    );
    await runner.query(`INSERT INTO receipt_generation_outbox(id, receipt_id, order_id, user_id, generation_id)
      SELECT uuid_generate_v4(), id, order_id, user_id, generation_id FROM receipts WHERE status = 'processing'
      ON CONFLICT (receipt_id, generation_id) DO NOTHING`);
  }
  async down(runner: QueryRunner): Promise<void> {
    // tg_updates predates this migration in deployed apps. Keep its idempotency history on rollback.
    await runner.query(
      `DROP POLICY IF EXISTS public_recipient_read ON recipients`,
    );
    await runner.query(`DROP POLICY IF EXISTS public_item_read ON order_items`);
    await runner.query(`DROP POLICY IF EXISTS public_order_read ON orders`);
    await runner.query(`DROP POLICY IF EXISTS public_receipt_read ON receipts`);
    await runner.query(`DROP TABLE receipt_generation_outbox`);
    await runner.query(
      `ALTER TABLE receipts DROP COLUMN generation_id, DROP COLUMN generation_started_at`,
    );
  }
}
