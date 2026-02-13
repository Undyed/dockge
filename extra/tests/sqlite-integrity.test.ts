import fs from "fs";
import path from "path";
import assert from "assert";
import { Database } from "../../backend/database";
import { DockgeServer } from "../../backend/dockge-server";
import { db } from "../../backend/db/knex";

async function main() {
    console.log("Running Extended SQLite Integrity tests...");
    const tmpDir = path.join(process.cwd(), "tmp", "db-integrity-tests-" + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    fs.writeFileSync(
        path.join(tmpDir, "db-config.json"),
        JSON.stringify({
            type: "sqlite",
        }, null, 4)
    );

    const server = {
        config: {
            dataDir: tmpDir,
            stacksDir: tmpDir,
        }
    } as unknown as DockgeServer;

    try {
        await Database.init(server);
        console.log("Database initialized with migrations.");

        // 1. Test Foreign Keys
        console.log("Testing Foreign Keys...");
        // Assuming user table exists and we might have a hypothetical table with FK
        // Since we only have settings, user, agent, let's check if we can create a temp table with FK
        await db.schema.createTable("parent", (table) => {
            table.increments("id").primary();
            table.string("name");
        });
        await db.schema.createTable("child", (table) => {
            table.increments("id").primary();
            table.integer("parent_id").unsigned().references("id").inTable("parent").onDelete("CASCADE");
        });

        await db("parent").insert({ id: 1, name: "parent1" });
        await db("child").insert({ id: 1, parent_id: 1 });

        // Test cascade delete
        await db("parent").where({ id: 1 }).delete();
        const childCount = await db("child").count("id as count").first();
        assert.strictEqual(Number((childCount as any).count), 0, "Child record should be deleted by CASCADE");

        // 2. Test WAL Mode
        console.log("Testing WAL Mode...");
        const journalMode = await db.raw("PRAGMA journal_mode");
        // SQLite returns journal_mode as an object/array depending on driver
        const mode = journalMode[0].journal_mode || journalMode[0].rows?.[0]?.journal_mode;
        assert.ok(["wal", "WAL"].includes(mode), `Expected WAL mode, got ${mode}`);

        // 3. Test Concurrent Access (Basic)
        console.log("Testing Concurrent Access...");
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(db("parent").insert({ name: `concurrent-${i}` }));
        }
        await Promise.all(promises);
        const count = await db("parent").count("id as count").first();
        assert.strictEqual(Number((count as any).count), 10, "Should handle concurrent inserts");

        // 4. Test Large Data
        console.log("Testing Large Data...");
        const largeStr = "A".repeat(1024 * 1024); // 1MB
        await db("parent").insert({ name: largeStr });
        const retrieved = await db("parent").where({ name: largeStr }).first();
        assert.ok(retrieved, "Should retrieve large data");

        console.log("Extended SQLite Integrity tests passed!");
    } catch (e) {
        console.error("Integrity tests failed:", e);
        throw e;
    } finally {
        await Database.close();
        fs.rmSync(tmpDir, {
            recursive: true,
            force: true,
        });
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
