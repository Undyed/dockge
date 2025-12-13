import type { Knex } from "knex";

let dbInstance: Knex | null = null;

export function setDb(instance: Knex) {
    dbInstance = instance;
}

function getDb(): Knex {
    if (!dbInstance) {
        throw new Error("Database is not initialized");
    }
    return dbInstance;
}

const callableTarget = (() => undefined) as unknown as Knex;
export const db = new Proxy(callableTarget, {
    get(_target, prop, receiver) {
        const k = getDb() as unknown as Record<string, unknown>;
        const v = Reflect.get(k, prop, receiver);
        return typeof v === "function" ? v.bind(k) : v;
    },
    apply(_target, thisArg, argArray) {
        const k = getDb() as unknown as (this: unknown, ...args: unknown[]) => unknown;
        return k.apply(thisArg, argArray as unknown[]);
    }
});

export { getDb };
