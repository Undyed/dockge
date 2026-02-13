import assert from "assert";
import { run } from "../close-incorrect-issue.js";

async function testGithubAction() {
    console.log("Running Github Action tests...");

    let labelsAdded = [];
    let commentsCreated = [];
    let issueClosed = false;

    const mockClient = {
        issues: {
            listLabelsOnIssue: async () => ({
                data: [] // No labels, should trigger closing logic
            }),
            addLabels: async ({ labels }) => {
                labelsAdded.push(...labels);
            },
            createComment: async ({ body }) => {
                commentsCreated.push(body);
            },
            update: async ({ state }) => {
                if (state === "closed") {
                    issueClosed = true;
                }
            }
        }
    };

    // Test case: No labels (invalid format)
    await run("fake-token", "123", "testuser", mockClient);

    assert.ok(labelsAdded.includes("invalid-format"), "Should add invalid-format label");
    assert.ok(commentsCreated[0].includes("@testuser"), "Should mention the user in comment");
    assert.strictEqual(issueClosed, true, "Should close the issue");

    // Reset mocks
    labelsAdded = [];
    commentsCreated = [];
    issueClosed = false;

    const mockClientWithLabels = {
        issues: {
            listLabelsOnIssue: async () => ({
                data: [{ name: "bug" }] // Has labels, should not trigger closing logic
            })
        }
    };

    // Test case: Has labels (valid format)
    await run("fake-token", "124", "testuser", mockClientWithLabels);

    assert.strictEqual(labelsAdded.length, 0, "Should NOT add labels");
    assert.strictEqual(commentsCreated.length, 0, "Should NOT create comment");
    assert.strictEqual(issueClosed, false, "Should NOT close the issue");

    console.log("Github Action tests passed!");
}

testGithubAction().catch(err => {
    console.error("Tests failed:", err);
    process.exit(1);
});
