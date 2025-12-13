import fs from "fs";
import path from "path";
import assert from "assert";
import { Database } from "../../backend/database";
import { DockgeServer } from "../../backend/dockge-server";
import { SettingRepo } from "../../backend/repositories/setting-repo";
import { UserRepo } from "../../backend/repositories/user-repo";
import { AgentRepo } from "../../backend/repositories/agent-repo";

async function main() {
    const tmpDir = path.join(process.cwd(), "tmp", "repo-tests-" + Date.now());
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
    await Database.init(server);

    try {
        await testSettings();
        await testUsers();
        await testAgents();
        console.log("Repository tests passed");
    } finally {
        await Database.close();
        fs.rmSync(tmpDir, {
            recursive: true,
            force: true,
        });
    }
}

async function testSettings() {
    await SettingRepo.set("jwtSecret", "secret", null);
    const val = await SettingRepo.getValueByKey("jwtSecret");
    assert.strictEqual(val, JSON.stringify("secret"), "jwtSecret should be stored as JSON string");

    await SettingRepo.set("theme", "dark", "appearance");
    await SettingRepo.set("language", "en", "appearance");
    const rows = await SettingRepo.listByType("appearance");
    assert.ok(rows.length >= 2, "appearance settings should have at least 2 entries");
}

async function testUsers() {
    const initialCount = await UserRepo.getCount();
    assert.strictEqual(initialCount, 0, "initial user count should be 0");

    await UserRepo.create("admin", "hashed");
    const count = await UserRepo.getCount();
    assert.strictEqual(count, 1, "user count should be 1 after create");

    const user = await UserRepo.getFirstUser();
    assert.ok(user && user.username === "admin", "first user should be admin");

    if (user) {
        await UserRepo.updatePasswordById(user.id, "hashed2");
        const updated = await UserRepo.getByIdActive(user.id);
        assert.ok(updated && updated.password === "hashed2", "password should be updated");

        await UserRepo.updateTwofaLastToken(user.id, "123456");
        const updated2 = await UserRepo.getByIdActive(user.id);
        assert.ok(updated2 && updated2.twofa_last_token === "123456", "twofa_last_token should be updated");
    }
}

async function testAgents() {
    const agent = await AgentRepo.create("http://127.0.0.1:5001", "u", "p");
    assert.ok(agent.url.includes("127.0.0.1"), "agent url should match");

    const list = await AgentRepo.list();
    assert.ok(list.length >= 1, "agent list should contain created agent");

    await AgentRepo.removeByUrl("http://127.0.0.1:5001");
    const list2 = await AgentRepo.list();
    assert.ok(list2.length === 0, "agent list should be empty after removal");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
