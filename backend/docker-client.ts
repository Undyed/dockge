import Dockerode from "dockerode";
import childProcessAsync from "promisify-child-process";
import { log } from "./log";

/**
 * Docker client wrapper that provides compatibility with Docker 29+
 * Uses both dockerode API and CLI commands for maximum compatibility
 */
export class DockerClient {
    private static instance: DockerClient;
    private dockerode: Dockerode;
    private useAPI: boolean = false;
    private connectionCheckPromise: Promise<void> | null = null;

    private constructor() {
        // Initialize dockerode with socket connection
        this.dockerode = new Dockerode({ socketPath: "/var/run/docker.sock" });
        // Kick off connection check but do not block instantiation
        void this.ensureConnectionChecked();
    }

    public static getInstance(): DockerClient {
        if (!DockerClient.instance) {
            DockerClient.instance = new DockerClient();
        }
        return DockerClient.instance;
    }

    /**
     * Check if Docker API is accessible
     */
    private async performConnectionCheck(): Promise<void> {
        try {
            await this.dockerode.ping();
            this.useAPI = true;
            log.info("docker-client", "Docker API connection successful");
        } catch (e) {
            log.warn("docker-client", "Docker API not accessible, falling back to CLI");
            this.useAPI = false;
        }
    }

    /**
     * Ensure connection check is completed once
     */
    private async ensureConnectionChecked(): Promise<void> {
        if (!this.connectionCheckPromise) {
            this.connectionCheckPromise = this.performConnectionCheck();
        }
        await this.connectionCheckPromise;
    }

    /**
     * Retry connection check if API was unavailable before
     */
    private async retryConnectionCheckIfNeeded(): Promise<void> {
        if (!this.useAPI) {
            this.connectionCheckPromise = this.performConnectionCheck();
            await this.connectionCheckPromise;
        }
    }

    /**
     * Execute docker compose command (Docker Compose V2 is required)
     */
    async composeExec(
        args: string[],
        cwd: string,
        options: { encoding?: string } = {}
    ): Promise<childProcessAsync.ChildProcessPromise> {
        const encoding = options.encoding || "utf-8";

        return await childProcessAsync.spawn("docker", [ "compose", ...args ], {
            cwd,
            encoding,
        });
    }

    /**
     * Execute docker command with better error handling
     */
    async dockerExec(
        args: string[],
        options: { encoding?: string; cwd?: string } = {}
    ): Promise<childProcessAsync.ChildProcessPromise> {
        const encoding = options.encoding || "utf-8";

        return await childProcessAsync.spawn("docker", args, {
            cwd: options.cwd,
            encoding,
        });
    }

    /**
     * Get Docker version information
     */
    async getVersion(): Promise<{ version: string; apiVersion: string }> {
        try {
            await this.ensureConnectionChecked();
            await this.retryConnectionCheckIfNeeded();

            if (this.useAPI) {
                const version = await this.dockerode.version();
                return {
                    version: version.Version || "unknown",
                    apiVersion: version.ApiVersion || "unknown",
                };
            } else {
                const res = await this.dockerExec([ "version", "--format", "{{.Server.Version}}" ]);
                const version = res.stdout?.toString().trim() || "unknown";
                return {
                    version,
                    apiVersion: "CLI",
                };
            }
        } catch (e) {
            if (e instanceof Error) {
                log.error("docker-client", "Failed to get Docker version: " + e.message);
            }
            return {
                version: "unknown",
                apiVersion: "unknown",
            };
        }
    }

    /**
     * Get network list using API when available
     */
    async getNetworkList(): Promise<string[]> {
        try {
            await this.ensureConnectionChecked();
            await this.retryConnectionCheckIfNeeded();

            if (this.useAPI) {
                const networks = await this.dockerode.listNetworks();
                return networks
                    .map((network) => network.Name)
                    .filter((name) => name !== "")
                    .sort((a, b) => a.localeCompare(b));
            } else {
                // Fallback to CLI
                const res = await this.dockerExec([ "network", "ls", "--format", "{{.Name}}" ]);
                if (!res.stdout) {
                    return [];
                }
                return res.stdout
                    .toString()
                    .split("\n")
                    .filter((item) => item !== "")
                    .sort((a, b) => a.localeCompare(b));
            }
        } catch (e) {
            if (e instanceof Error) {
                log.error("docker-client", "Failed to get network list: " + e.message);
            }
            return [];
        }
    }

    /**
     * Check if Docker daemon is accessible
     */
    async isDockerAvailable(): Promise<boolean> {
        try {
            await this.ensureConnectionChecked();
            await this.retryConnectionCheckIfNeeded();

            if (this.useAPI) {
                await this.dockerode.ping();
                return true;
            } else {
                const res = await this.dockerExec([ "info" ]);
                return res.code === 0;
            }
        } catch (e) {
            return false;
        }
    }
}
