import { db } from "../db/knex";

export interface UserRow {
    id: number;
    username: string;
    password: string;
    active: number;
    twofa_status?: number;
    twofa_secret?: string;
    twofa_last_token?: string;
}

export class UserRepo {
    static async getByUsernameActive(username: string): Promise<UserRow | undefined> {
        const row = await db("user").where({ username,
            active: 1 }).first();
        return row as UserRow | undefined;
    }

    static async getByIdActive(id: number): Promise<UserRow | undefined> {
        const row = await db("user").where({ id,
            active: 1 }).first();
        return row as UserRow | undefined;
    }

    static async updatePasswordById(id: number, hashed: string): Promise<void> {
        await db("user").where({ id }).update({ password: hashed });
    }

    static async updateTwofaLastToken(id: number, token: string): Promise<void> {
        await db("user").where({ id }).update({ twofa_last_token: token });
    }

    static async getCount(): Promise<number> {
        const row = await db("user").count("id as count").first();
        const count = (row as unknown as { count: number | string } | undefined)?.count ?? 0;
        return typeof count === "string" ? Number(count) : count;
    }

    static async getFirstUser(): Promise<UserRow | undefined> {
        const row = await db("user").first();
        return row as UserRow | undefined;
    }

    static async create(username: string, passwordHash: string): Promise<UserRow> {
        await db("user").insert({ username,
            password: passwordHash });
        const row = await this.getByUsernameActive(username);
        if (!row) {
            throw new Error("Failed to create user");
        }
        return row;
    }
}
