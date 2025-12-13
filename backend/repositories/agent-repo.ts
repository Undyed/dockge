import { db } from "../db/knex";

export interface AgentRow {
    id?: number;
    url: string;
    username: string;
    password: string;
}

export class AgentRepo {
    static async list(): Promise<AgentRow[]> {
        const rows = await db("agent").select("id", "url", "username", "password");
        return rows as AgentRow[];
    }

    static async getByUrl(url: string): Promise<AgentRow | undefined> {
        const row = await db("agent").where({ url }).first();
        return row as AgentRow | undefined;
    }

    static async create(url: string, username: string, password: string): Promise<AgentRow> {
        await db("agent").insert({ url,
            username,
            password });
        const row = await this.getByUrl(url);
        if (!row) {
            throw new Error("Failed to insert agent");
        }
        return row;
    }

    static async removeByUrl(url: string): Promise<number> {
        const res = await db("agent").where({ url }).del();
        return res as number;
    }
}
