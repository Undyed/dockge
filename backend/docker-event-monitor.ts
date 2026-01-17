import { log } from "./log";
import { DockerClient } from "./docker-client";
import { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";

export class DockerEventMonitor {
    private server: DockgeServer;
    private dockerEventReconnectAttempts = 0;
    private readonly maxDockerEventReconnectAttempts = 10;
    private dockerEventStream: NodeJS.ReadableStream | null = null;
    private dockerEventReconnectTimeout: NodeJS.Timeout | null = null;
    private dockerEventMonitorStarting = false;

    private pendingEventProjectNames = new Set<string>();
    private eventStatusSyncTimeout: NodeJS.Timeout | null = null;
    private eventStatusSyncInProgress = false;

    constructor(server: DockgeServer) {
        this.server = server;
    }

    async start(): Promise<boolean> {
        if (this.dockerEventStream) {
            return true;
        }

        if (this.dockerEventMonitorStarting) {
            return false;
        }

        this.dockerEventMonitorStarting = true;
        const client = DockerClient.getInstance();

        try {
            const stream = await client.getEvents();

            if (!stream) {
                log.warn("server", "Docker event monitoring disabled - API not available");
                return false;
            }

            this.dockerEventStream = stream;
            let buffer = "";

            stream.on("data", async (chunk) => {
                // Reset reconnect attempts on successful data
                this.dockerEventReconnectAttempts = 0;

                buffer += chunk.toString();
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) {
                        continue;
                    }
                    try {
                        const event = JSON.parse(line);
                        if (event.Type === "container" && event.Actor?.Attributes) {
                            const projectName = event.Actor.Attributes["com.docker.compose.project"];
                            if (projectName) {
                                this.scheduleEventStatusSync(projectName);
                            }
                        }
                    } catch (e) {
                        // Ignore invalid JSON (partial data)
                    }
                }
            });

            stream.on("error", (err) => {
                log.error("server", "Docker event stream error: " + (err instanceof Error ? err.message : String(err)));
                this.scheduleReconnect();
            });

            stream.on("end", () => {
                log.warn("server", "Docker event stream ended unexpectedly");
                this.scheduleReconnect();
            });

            stream.on("close", () => {
                log.debug("server", "Docker event stream closed");
                // Only reconnect if this wasn't intentional (e.g., during shutdown)
                if (this.dockerEventStream) {
                    this.scheduleReconnect();
                }
            });

            log.info("server", "Docker event monitor started");
            return true;
        } catch (e) {
            log.error("server", "Failed to start Docker event monitor: " + (e instanceof Error ? e.message : String(e)));
            this.scheduleReconnect();
            return false;
        } finally {
            this.dockerEventMonitorStarting = false;
        }
    }

    close() {
        this.cleanupStream();
        this.pendingEventProjectNames.clear();

        if (this.eventStatusSyncTimeout) {
            clearTimeout(this.eventStatusSyncTimeout);
            this.eventStatusSyncTimeout = null;
        }

        if (this.dockerEventReconnectTimeout) {
            clearTimeout(this.dockerEventReconnectTimeout);
            this.dockerEventReconnectTimeout = null;
        }
    }

    private scheduleReconnect() {
        if (this.dockerEventReconnectTimeout) {
            return;
        }

        // Clean up current stream
        this.cleanupStream();

        if (this.dockerEventReconnectAttempts < this.maxDockerEventReconnectAttempts) {
            this.dockerEventReconnectAttempts++;
            // Exponential backoff: 2s, 4s, 8s, 16s, ... max 5 minutes
            const delay = Math.min(2000 * Math.pow(2, this.dockerEventReconnectAttempts - 1), 300000);
            log.info("server", `Reconnecting to Docker events in ${delay / 1000}s (attempt ${this.dockerEventReconnectAttempts}/${this.maxDockerEventReconnectAttempts})`);

            this.dockerEventReconnectTimeout = setTimeout(() => {
                this.dockerEventReconnectTimeout = null;
                void this.start();
            }, delay);
        } else {
            log.error("server", "Max reconnect attempts reached for Docker events. Event monitoring disabled.");
            log.info("server", "Stack status will still be updated via periodic polling.");
        }
    }

    private scheduleEventStatusSync(projectName: string) {
        this.pendingEventProjectNames.add(projectName);

        if (this.eventStatusSyncTimeout) {
            return;
        }

        // Debounce multiple events into a single status update & push.
        this.eventStatusSyncTimeout = setTimeout(() => {
            this.eventStatusSyncTimeout = null;
            void this.flushEventStatusSync();
        }, 1000);
    }

    private async flushEventStatusSync() {
        if (this.eventStatusSyncInProgress) {
            // Let the pending set accumulate; the next timer tick will flush.
            if (!this.eventStatusSyncTimeout) {
                this.eventStatusSyncTimeout = setTimeout(() => {
                    this.eventStatusSyncTimeout = null;
                    void this.flushEventStatusSync();
                }, 1000);
            }
            return;
        }

        this.eventStatusSyncInProgress = true;
        try {
            const projectNames = Array.from(this.pendingEventProjectNames);
            this.pendingEventProjectNames.clear();

            if (projectNames.length === 0) {
                return;
            }

            const stackList = await Stack.getStackList(this.server, true, true);
            let changedAny = false;

            for (const projectName of projectNames) {
                const stack = stackList.get(projectName);
                if (!stack) {
                    continue;
                }

                const changed = await stack.syncStatus();
                if (changed) {
                    changedAny = true;
                }
            }

            if (changedAny) {
                log.debug("server", "Stack status changed (Event), sending update");
                await this.server.sendStackList(true, true);
            }
        } finally {
            this.eventStatusSyncInProgress = false;
        }
    }

    private cleanupStream() {
        if (this.dockerEventStream) {
            try {
                // Remove all listeners to prevent memory leaks
                this.dockerEventStream.removeAllListeners();
                // Attempt to destroy the stream if possible
                if ("destroy" in this.dockerEventStream && typeof this.dockerEventStream.destroy === "function") {
                    // @ts-ignore
                    this.dockerEventStream.destroy();
                }
            } catch (e) {
                log.debug("server", "Error cleaning up Docker event stream: " + (e instanceof Error ? e.message : String(e)));
            }
            this.dockerEventStream = null;
        }
    }
}
