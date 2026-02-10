import { Cron } from "croner";
import { DockgeServer } from "./dockge-server";
import { Stack } from "./stack";
import { log } from "./log";
import { DockgeSocket } from "./util-server";

/**
 * StatsProvider manages the real-time statistics collection for Docker stacks.
 * It periodically polls 'docker compose stats' for subscribed stacks and broadcasts the data.
 */
export class StatsProvider {
    private server: DockgeServer;
    private job: Cron | null = null;
    /**
     * Track subscriptions: stackID -> Set of socket IDs
     * stackID is JSON.stringify([ endpoint, stackName ])
     */
    private subscriptions: Map<string, Set<string>> = new Map();
    private intervalSeconds: number = 5;

    constructor(server: DockgeServer) {
        this.server = server;
    }

    private getStackID(endpoint: string, stackName: string): string {
        return JSON.stringify([endpoint, stackName]);
    }

    private parseStackID(stackID: string): { endpoint: string; stackName: string } | null {
        try {
            const parsed = JSON.parse(stackID);
            if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && typeof parsed[1] === "string") {
                return {
                    endpoint: parsed[0],
                    stackName: parsed[1],
                };
            }
        } catch {
            // Ignore malformed stackID
        }

        return null;
    }

    /**
     * Start the stats collection job if not already running.
     */
    public start() {
        if (this.job) {
            return;
        }

        log.info("stats-provider", "Starting stats collection job");
        this.job = new Cron(`*/${this.intervalSeconds} * * * * *`, {
            protect: true,
        }, () => {
            void this.collectAndBroadcast();
        });
    }

    /**
     * Stop the stats collection job.
     */
    public stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
            log.info("stats-provider", "Stopped stats collection job");
        }
    }

    /**
     * Update the polling interval.
     * @param seconds Interval in seconds
     */
    public setInterval(seconds: number) {
        this.intervalSeconds = Math.max(1, seconds);
        if (this.job) {
            this.stop();
            this.start();
        }
    }

    /**
     * Subscribe a socket to stats updates for a specific stack.
     * @param socket The client socket
     * @param stackName The name of the stack
     */
    public subscribe(socket: DockgeSocket, stackName: string) {
        const endpoint = socket.endpoint || "";
        const stackID = this.getStackID(endpoint, stackName);

        if (!this.subscriptions.has(stackID)) {
            this.subscriptions.set(stackID, new Set());
        }
        this.subscriptions.get(stackID)!.add(socket.id);

        log.debug("stats-provider", `Socket ${socket.id} subscribed to ${stackName} [${endpoint}]`);

        // Start job if not running
        this.start();

        // Immediate first poll for this stack
        void this.pollStack(endpoint, stackName, [socket]);

        // Clean up on disconnect
        socket.on("disconnect", () => {
            this.unsubscribe(socket, stackName);
        });
    }

    /**
     * Unsubscribe a socket from stats updates.
     * @param socket The client socket
     * @param stackName The name of the stack
     */
    public unsubscribe(socket: DockgeSocket, stackName: string) {
        const endpoint = socket.endpoint || "";
        const stackID = this.getStackID(endpoint, stackName);

        if (this.subscriptions.has(stackID)) {
            const subs = this.subscriptions.get(stackID)!;
            subs.delete(socket.id);
            if (subs.size === 0) {
                this.subscriptions.delete(stackID);
                log.debug("stats-provider", `No more subscribers for ${stackName} [${endpoint}], removing subscription`);
            }
        }

        if (this.subscriptions.size === 0) {
            this.stop();
        }
    }

    /**
     * Collect stats for all subscribed stacks and broadcast to relevant clients.
     */
    private async collectAndBroadcast() {
        if (this.subscriptions.size === 0) {
            this.stop();
            return;
        }

        // Get all active authenticated sockets
        const activeSockets = Array.from(this.server.io.sockets.sockets.values()).filter(s => {
            const ds = s as DockgeSocket;
            return ds.userID;
        }) as DockgeSocket[];

        if (activeSockets.length === 0) {
            return;
        }

        for (const [stackID, socketIDs] of this.subscriptions.entries()) {
            const parsedStackID = this.parseStackID(stackID);

            if (!parsedStackID) {
                this.subscriptions.delete(stackID);
                continue;
            }

            const { endpoint, stackName } = parsedStackID;

            // Filter sockets that are actually still connected and subscribed to this stack
            const relevantSockets = activeSockets.filter(s => socketIDs.has(s.id));

            if (relevantSockets.length > 0) {
                await this.pollStack(endpoint, stackName, relevantSockets);
            } else {
                // If no active sockets are left for this stackID, clean it up
                this.subscriptions.delete(stackID);
            }
        }

        if (this.subscriptions.size === 0) {
            this.stop();
        }
    }

    /**
     * Poll stats for a single stack and emit to the server.
     */
    private async pollStack(endpoint: string, stackName: string, activeSockets: DockgeSocket[]) {
        try {
            // We need to get the stack instance.
            // If it is a remote agent, this provider runs on the AGENT.
            // If it is the main server, it runs on the MAIN server.

            const stack = await Stack.getStack(this.server, stackName, true);
            const stats = await stack.stats();

            // Broadcast to relevant sockets
            for (const socket of activeSockets) {
                socket.emitAgent("stackStats", {
                    stackName,
                    stats,
                });
            }
        } catch (e) {
            log.warn("stats-provider", `Failed to poll stats for ${stackName}: ${e}`);
        }
    }
}
