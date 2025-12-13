import { db } from "../db/knex";

export interface SettingRow {
    id?: number;
    key: string;
    value: string;
    type?: string | null;
}

export class SettingRepo {
    static async getByKey(key: string): Promise<SettingRow | undefined> {
        const row = await db("setting").where({ key }).first();
        if (!row) {
            return undefined;
        }
        return row as SettingRow;
    }

    static async getValueByKey(key: string): Promise<string | null> {
        const row = await this.getByKey(key);
        return row ? row.value : null;
    }

    static async listByType(type: string): Promise<SettingRow[]> {
        const rows = await db("setting").where({ type }).select("key", "value");
        return rows as SettingRow[];
    }

    static async set(key: string, value: unknown, type: string | null = null): Promise<void> {
        const json = JSON.stringify(value);
        const existing = await db("setting").where({ key }).first();
        if (existing) {
            await db("setting").where({ key }).update({ value: json,
                type });
        } else {
            await db("setting").insert({ key,
                value: json,
                type });
        }
    }

    static async setBulk(type: string, data: Record<string, unknown>): Promise<void> {
        const keys = Object.keys(data);
        await db.transaction(async (trx) => {
            for (const key of keys) {
                const json = JSON.stringify(data[key]);
                const existing = await trx("setting").where({ key }).first();
                if (existing) {
                    await trx("setting").where({ key }).update({
                        value: json,
                        type
                    });
                } else {
                    await trx("setting").insert({
                        key,
                        value: json,
                        type
                    });
                }
            }
        });
    }
}
