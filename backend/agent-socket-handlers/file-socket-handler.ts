import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { AgentSocket } from "../../common/agent-socket";
import { log } from "../log";
import fs from "fs/promises";
import path from "path";

export class FileSocketHandler extends AgentSocketHandler {
    create(socket: DockgeSocket, server: DockgeServer, agentSocket: AgentSocket) {
        const stacksRoot = path.resolve(server.stacksDir);

        const resolveStackDir = (stackName: string) => {
            const stackDir = path.resolve(stacksRoot, stackName);
            if (stackDir === stacksRoot || !stackDir.startsWith(stacksRoot + path.sep)) {
                throw new ValidationError("Invalid stack name");
            }
            return stackDir;
        };

        const resolveStackFilePath = (stackDir: string, filePath: string) => {
            const resolvedPath = path.resolve(stackDir, filePath);
            if (resolvedPath === stackDir || !resolvedPath.startsWith(stackDir + path.sep)) {
                throw new ValidationError("Invalid file path");
            }
            return resolvedPath;
        };

        // Read custom file
        agentSocket.on("readCustomFile", async (stackName: unknown, filePath: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof stackName !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                if (typeof filePath !== "string") {
                    throw new ValidationError("File path must be a string");
                }

                const stackDir = resolveStackDir(stackName);
                const resolvedPath = resolveStackFilePath(stackDir, filePath);

                // Check if file exists
                try {
                    await fs.access(resolvedPath);
                } catch (e) {
                    throw new ValidationError("File does not exist");
                }

                // Read file content
                const content = await fs.readFile(resolvedPath, "utf-8");

                callbackResult({
                    ok: true,
                    content,
                    filePath,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // Save custom file
        agentSocket.on("saveCustomFile", async (stackName: unknown, filePath: unknown, content: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof stackName !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }
                if (typeof filePath !== "string") {
                    throw new ValidationError("File path must be a string");
                }
                if (typeof content !== "string") {
                    throw new ValidationError("Content must be a string");
                }

                const stackDir = resolveStackDir(stackName);
                const resolvedPath = resolveStackFilePath(stackDir, filePath);

                // Write file content
                await fs.writeFile(resolvedPath, content, "utf-8");

                callbackResult({
                    ok: true,
                    msg: "File saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // List files in stack directory
        agentSocket.on("listStackFiles", async (stackName: unknown, callback) => {
            try {
                log.debug("file-socket-handler", `listStackFiles called for stack: ${stackName}`);
                checkLogin(socket);

                if (typeof stackName !== "string") {
                    throw new ValidationError("Stack name must be a string");
                }

                const stackDir = resolveStackDir(stackName);
                log.debug("file-socket-handler", `Stack directory: ${stackDir}`);

                // Check if directory exists
                try {
                    await fs.access(stackDir);
                } catch (e) {
                    log.warn("file-socket-handler", `Stack directory does not exist: ${stackDir}`);
                    throw new ValidationError("Stack directory does not exist");
                }

                // Read directory contents
                const files = await fs.readdir(stackDir);
                log.debug("file-socket-handler", `Found ${files.length} items in directory`);

                // Filter text files and get file info
                const fileList = [];
                for (const file of files) {
                    const filePath = path.join(stackDir, file);
                    const stats = await fs.stat(filePath);

                    if (stats.isFile()) {
                        fileList.push({
                            name: file,
                            size: stats.size,
                            modified: stats.mtime,
                        });
                    }
                }

                log.debug("file-socket-handler", `Returning ${fileList.length} files`);
                callbackResult({
                    ok: true,
                    files: fileList,
                }, callback);
            } catch (e) {
                log.error("file-socket-handler", "listStackFiles error: " + (e instanceof Error ? e.message : String(e)));
                callbackError(e, callback);
            }
        });
    }
}
