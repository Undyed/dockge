import { log } from "./log";
import { SettingRepo } from "./repositories/setting-repo";

export class Settings {

    /**
     *  Example:
     *      {
     *         key1: {
     *             value: "value2",
     *             timestamp: 12345678
     *         },
     *         key2: {
     *             value: 2,
     *             timestamp: 12345678
     *         },
     *     }
     */
    static cacheList: Record<string, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: any,
        timestamp: number
    }> = {

        };

    static cacheCleaner?: NodeJS.Timeout;

    /**
     * Retrieve value of setting based on key
     * @param key Key of setting to retrieve
     * @returns Value
     */
    static async get(key: string) {

        // Start cache clear if not started yet
        if (!Settings.cacheCleaner) {
            Settings.cacheCleaner = setInterval(() => {
                log.debug("settings", "Cache Cleaner is just started.");
                for (key in Settings.cacheList) {
                    if (Date.now() - Settings.cacheList[key].timestamp > 60 * 1000) {
                        log.debug("settings", "Cache Cleaner deleted: " + key);
                        delete Settings.cacheList[key];
                    }
                }

            }, 60 * 1000);
        }

        // Query from cache
        if (key in Settings.cacheList) {
            const v = Settings.cacheList[key].value;
            log.debug("settings", `Get Setting (cache): ${key}: ${v}`);
            return v;
        }

        const value = await SettingRepo.getValueByKey(key);

        try {
            if (value === null) {
                return null;
            }
            const v = JSON.parse(value);
            log.debug("settings", `Get Setting: ${key}: ${v}`);

            Settings.cacheList[key] = {
                value: v,
                timestamp: Date.now()
            };

            return v;
        } catch (e) {
            return value;
        }
    }

    /**
     * Sets the specified setting to specified value
     * @param key Key of setting to set
     * @param value Value to set to
     * @param {?string} type Type of setting
     * @returns {Promise<void>}
     */
    static async set(key: string, value: object | string | number | boolean, type: string | null = null) {
        await SettingRepo.set(key, value, type);

        Settings.deleteCache([key]);
    }

    /**
     * Get settings based on type
     * @param type The type of setting
     * @returns Settings
     */
    static async getSettings(type: string) {
        const list = await SettingRepo.listByType(type);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: Record<string, any> = {};

        for (const row of list) {
            try {
                result[row.key] = JSON.parse(row.value);
            } catch (e) {
                result[row.key] = row.value;
            }
        }

        return result;
    }

    /**
     * Set settings based on type
     * @param type Type of settings to set
     * @param data Values of settings
     * @returns {Promise<void>}
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static async setSettings(type: string, data: Record<string, any>) {
        await SettingRepo.setBulk(type, data);
        Settings.deleteCache(Object.keys(data));
    }

    /**
     * Delete selected keys from settings cache
     * @param {string[]} keyList Keys to remove
     * @returns {void}
     */
    static deleteCache(keyList: string[]) {
        for (const key of keyList) {
            delete Settings.cacheList[key];
        }
    }

    /**
     * Stop the cache cleaner if running
     * @returns {void}
     */
    static stopCacheCleaner() {
        if (Settings.cacheCleaner) {
            clearInterval(Settings.cacheCleaner);
            Settings.cacheCleaner = undefined;
        }
    }
}
