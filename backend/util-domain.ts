import yaml from "yaml";
import { log } from "./log";

type ComposeService = {
    labels?: Record<string, unknown> | unknown[];
    environment?: Record<string, unknown> | unknown[];
};

type ComposeConfig = {
    services?: Record<string, ComposeService>;
    "x-dockge"?: {
        urls?: unknown[];
    };
};

export interface StackDomainInfo {
    stackName: string;
    services: {
        serviceName: string;
        domains: string[];
    }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStringMap(value: Record<string, unknown> | unknown[]): Record<string, string> {
    if (Array.isArray(value)) {
        const result: Record<string, string> = {};

        for (const item of value) {
            if (typeof item !== "string") {
                continue;
            }

            const parts = item.split("=");
            if (parts.length < 2) {
                continue;
            }

            const [ key, ...rest ] = parts;
            result[key] = rest.join("=");
        }

        return result;
    }

    const result: Record<string, string> = {};
    for (const [ key, entryValue ] of Object.entries(value)) {
        result[key] = String(entryValue);
    }
    return result;
}

function extractTraefikHosts(rule: string): string[] {
    const hosts: string[] = [];
    const hostRuleRegex = /Host\(([^)]*)\)/g;
    let hostRuleMatch: RegExpExecArray | null;

    while ((hostRuleMatch = hostRuleRegex.exec(rule)) !== null) {
        const hostArgs = hostRuleMatch[1];
        const hostValueRegex = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
        let hostValueMatch: RegExpExecArray | null;

        while ((hostValueMatch = hostValueRegex.exec(hostArgs)) !== null) {
            const host = hostValueMatch[1] || hostValueMatch[2] || hostValueMatch[3];
            if (host) {
                hosts.push(host);
            }
        }
    }

    return hosts;
}

/**
 * Get domains from stack compose file
 * Priority:
 * 1. x-dockge.urls (Official Dockge way)
 * 2. Traefik labels (Host(`...`))
 * 3. Nginx-proxy environment variables (VIRTUAL_HOST)
 * @param stackName
 * @param composeYAML
 */
export function getDomainsFromStack(stackName: string, composeYAML: string): StackDomainInfo {
    const domainInfo: StackDomainInfo = {
        stackName,
        services: [],
    };

    try {
        const doc = yaml.parse(composeYAML) as ComposeConfig | null;

        if (!isRecord(doc)) {
            return domainInfo;
        }

        // 1. Check x-dockge.urls
        if (isRecord(doc["x-dockge"]) && Array.isArray(doc["x-dockge"].urls)) {
            const urls: string[] = [];
            for (const url of doc["x-dockge"].urls) {
                if (typeof url === "string") {
                    try {
                        const u = new URL(url);
                        if (u.hostname) {
                            urls.push(url);
                        }
                    } catch (e) {
                        // If it's not a valid URL (e.g. just a domain), push it as is if it looks like a domain
                        if (url.includes(".") && !url.includes(" ") && !url.includes("/")) {
                            urls.push("http://" + url);
                        }
                    }
                }
            }
            if (urls.length > 0) {
                // For x-dockge, we don't know which service it belongs to, so we just put it in a "general" service or the first one
                // But to align with the return type, let's look for the first service name if possible
                let serviceName = "general";
                if (doc.services && typeof doc.services === "object") {
                    const keys = Object.keys(doc.services);
                    if (keys.length > 0) {
                        serviceName = keys[0];
                    }
                }

                domainInfo.services.push({
                    serviceName,
                    domains: urls,
                });
                return domainInfo;
            }
        }

        // 2 & 3. Check services for Traefik labels and Environment variables
        if (isRecord(doc.services)) {
            for (const [ serviceName, service ] of Object.entries(doc.services)) {
                if (!isRecord(service)) {
                    continue;
                }

                const domains: Set<string> = new Set();

                // Check Labels (Traefik)
                if (service.labels) {
                    const labels = normalizeStringMap(service.labels);

                    for (const value of Object.values(labels)) {
                        const valStr = String(value);
                        // Traefik Host rule
                        // Example: Host(`example.com`) || Host(`example.com`, `www.example.com`)
                        if (valStr.includes("Host(")) {
                            for (const host of extractTraefikHosts(valStr)) {
                                domains.add("https://" + host);
                            }
                        }
                    }
                }

                // Check Environment (Nginx-Proxy)
                if (service.environment) {
                    const envs = normalizeStringMap(service.environment);

                    for (const [ key, value ] of Object.entries(envs)) {
                        if (key === "VIRTUAL_HOST") {
                            const valStr = String(value);
                            const hosts = valStr.split(",");
                            hosts.forEach((host) => {
                                const trimmedHost = host.trim();
                                if (trimmedHost) {
                                    domains.add("http://" + trimmedHost);
                                }
                            });
                        }
                    }
                }

                if (domains.size > 0) {
                    domainInfo.services.push({
                        serviceName,
                        domains: Array.from(domains),
                    });
                }
            }
        }

    } catch (e) {
        log.warn("getDomainsFromStack", `Failed to parse yaml for stack ${stackName}: ${e}`);
    }

    return domainInfo;
}
