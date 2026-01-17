import { AgentRepo, AgentRow } from "../repositories/agent-repo";

export interface AgentJSON {
    url: string;
    username: string;
    endpoint: string;
}

export class Agent {
    url!: string;
    username!: string;
    password!: string;

    static fromRow(row: AgentRow): Agent {
        const agent = new Agent();
        agent.url = row.url;
        agent.username = row.username;
        agent.password = row.password;
        return agent;
    }

    static async getAgentList(): Promise<Record<string, Agent>> {
        const rows = await AgentRepo.list();
        const result: Record<string, Agent> = {};
        for (const row of rows) {
            const agent = Agent.fromRow(row);
            result[agent.endpoint] = agent;
        }
        return result;
    }

    get endpoint(): string {
        let obj = new URL(this.url);
        return obj.host;
    }

    toJSON(): AgentJSON {
        return {
            url: this.url,
            username: this.username,
            endpoint: this.endpoint,
        };
    }

}

export default Agent;
