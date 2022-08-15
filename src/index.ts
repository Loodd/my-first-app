import { Probot } from "probot";
const commands = require('probot-commands')

export = (app: Probot) => {
  app.on("issues.opened", async (context) => {

    const issueComment = context.issue({
      body: `Thanks for opening this issue! ${JSON.stringify(context)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });

  commands(app, 'address', async (context: any, command: any) => {
    const labels = command.arguments;
    
    const issueComment = context.issue({
      body: `Test: ${JSON.stringify(labels)}`
    });

    await context.octokit.issues.createComment(issueComment);
  });
};
