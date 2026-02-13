import * as github from "@actions/github";
import { fileURLToPath } from "url";

/**
 * Main function
 * @param {string} token GitHub Token
 * @param {string} issueNumber Issue Number
 * @param {string} username Username
 * @param {any} [client] Optional octokit client for testing
 * @returns {Promise<void>}
 */
export async function run(token, issueNumber, username, client) {
    try {
        if (!client) {
            client = github.getOctokit(token).rest;
        }

        const issue = {
            owner: "louislam",
            repo: "dockge",
            number: issueNumber,
        };

        const labels = (
            await client.issues.listLabelsOnIssue({
                owner: issue.owner,
                repo: issue.repo,
                issue_number: issue.number
            })
        ).data.map(({ name }) => name);

        if (labels.length === 0) {
            console.log("Bad format here");

            await client.issues.addLabels({
                owner: issue.owner,
                repo: issue.repo,
                issue_number: issue.number,
                labels: ["invalid-format"]
            });

            // Add the issue closing comment
            await client.issues.createComment({
                owner: issue.owner,
                repo: issue.repo,
                issue_number: issue.number,
                body: `@${username}: Hello! :wave:\n\nThis issue is being automatically closed because it does not follow the issue template. Please DO NOT open a blank issue.`
            });

            // Close the issue
            await client.issues.update({
                owner: issue.owner,
                repo: issue.repo,
                issue_number: issue.number,
                state: "closed"
            });
        } else {
            console.log("Pass!");
        }
    } catch (e) {
        console.log(e);
        throw e;
    }
}

// Only run if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const token = process.argv[2];
    const issueNumber = process.argv[3];
    const username = process.argv[4];
    run(token, issueNumber, username).catch(() => {
        process.exit(1);
    });
}
